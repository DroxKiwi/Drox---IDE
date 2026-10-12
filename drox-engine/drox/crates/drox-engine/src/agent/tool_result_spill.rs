//! Spill / stub des gros `tool_result` (parent) — lot concentration **C1**.
//!
//! ## Rôles
//!
//! | Fonction | Quand |
//! |----------|--------|
//! | [`format_tool_result_for_llm`] | Juste après l’outil : JSON trop gros → disque + stub court |
//! | [`stub_for_hot_snip`] | Snip chaud (hors fenêtre) : **toujours** spill avant stub |
//!
//! ## Seuils (2026-10-09)
//!
//! - Outils lecture-lourds (`file_read`, `grep`, `glob`, …) : spill dès **8 KiB**.
//! - Autres outils (`bash`, …) : spill dès **24 KiB** (inchangé Vague 4).
//! - Preview dans le stub : **512 octets** (pas 2 KiB).
//!
//! Le corps complet reste sous `.drox/tool-outputs/` ; le chat ne garde qu’un
//! pointeur. Les outils d’index Explore (`explore_index_*`) sont hors scope
//! ici — ils lisent les artefacts, pas ces spills.

use camino::Utf8Path;
use serde_json::{Map, Value};
use tracing::{debug, warn};

/// Plafonds LLM pour outcome `task` (C2) — détail = `artifacts_inline` + fichiers kind.
const TASK_SUMMARY_MAX_CHARS: usize = 700;
const TASK_BLURB_MAX_CHARS: usize = 200;
const TASK_INLINE_KIND_MAX_CHARS: usize = 1_800;

/// Seuil par défaut (bash, task slim, outils divers) — Vague 4 / T-1.
pub(crate) const TOOL_RESULT_SPILL_THRESHOLD_BYTES: usize = 24 * 1024;

/// Seuil plus bas pour les dumps lecture (C1).
pub(crate) const READ_HEAVY_SPILL_THRESHOLD_BYTES: usize = 8 * 1024;

/// Extrait collé dans le stub (assez pour reconnaître le fichier, pas pour raisonner dessus).
const TOOL_RESULT_PREVIEW_BYTES: usize = 512;

/// Outils dont la sortie est typiquement un dump texte / liste (dogfood doc).
fn is_read_heavy_tool(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "file_read"
            | "grep"
            | "glob"
            | "explore_artifact_read"
            | "explore_index_list"
            | "explore_index_search"
            | "notebook_read"
    )
}

/// Seuil spill selon l’outil.
#[must_use]
pub(crate) fn spill_threshold_for_tool(tool_name: &str) -> usize {
    if is_read_heavy_tool(tool_name) {
        READ_HEAVY_SPILL_THRESHOLD_BYTES
    } else {
        TOOL_RESULT_SPILL_THRESHOLD_BYTES
    }
}

/// Déjà un stub spill (émission ou snip précédent) — ne pas réécrire le blob.
#[must_use]
pub(crate) fn looks_like_spill_stub(content: &str) -> bool {
    content.contains("LARGE OUTPUT SPILLED TO DISK")
        || content.contains(".drox/tool-outputs/")
        || content.contains("SPILLED FOR CONTEXT")
}

/// Corps `role=tool` après exécution réussie.
///
/// Explore `task` : pas de `report` monolithique — `artifacts_inline` borné + chemins kind.
pub(crate) fn format_tool_result_for_llm(
    tool_name: &str,
    value: &Value,
    workspace_root: &Utf8Path,
) -> String {
    let value_for_llm = if tool_name == "task" {
        slim_task_tool_result_for_llm(value)
    } else {
        value.clone()
    };
    let serialized = serde_json::to_string(&value_for_llm).unwrap_or_default();
    let threshold = spill_threshold_for_tool(tool_name);
    if serialized.len() <= threshold {
        return format!(
            "[drox: tool result for «{tool_name}» — JSON below; this is NOT a user message]\n{serialized}",
        );
    }
    match spill_tool_result_to_disk(workspace_root, tool_name, &serialized) {
        Ok(path) => {
            debug!(
                marker = "c1.spill",
                tool = %tool_name,
                bytes = serialized.len(),
                threshold,
                spill_path = %path,
                "dogfood: tool result spilled to disk"
            );
            format_spill_stub(tool_name, serialized.len(), &path, &serialized)
        }
        Err(e) => {
            warn!(
                marker = "c1.spill_failed",
                tool = %tool_name,
                error = %e,
                "tool result spill failed — truncating inline"
            );
            let truncated = &serialized[..serialized.len().min(threshold)];
            format!(
                "[drox: tool result for «{tool_name}» — LARGE OUTPUT TRUNCATED (spill failed: {e})]\n\
                 {truncated}\n…[truncated]"
            )
        }
    }
}

/// Snip chaud : remplace un gros résultat hors fenêtre par un stub.
///
/// Règle C1 : **spill d’abord** si le contenu n’est pas déjà un pointeur disque.
pub(crate) fn stub_for_hot_snip(workspace_root: &Utf8Path, content: &str) -> String {
    if looks_like_spill_stub(content) {
        return shorten_existing_spill_stub(content);
    }
    match spill_tool_result_to_disk(workspace_root, "hot-snip", content) {
        Ok(path) => format_spill_stub("tool", content.len(), &path, content),
        Err(e) => {
            warn!(error = %e, "hot-snip spill failed — using short placeholder");
            format!(
                "[drox: tool result — SPILL FAILED during hot snip ({e})]\n\
                 Output removed from context. Re-run the tool if still needed."
            )
        }
    }
}

fn format_spill_stub(tool_name: &str, bytes: usize, path: &str, body: &str) -> String {
    let preview_len = body.len().min(TOOL_RESULT_PREVIEW_BYTES);
    let preview = &body[..preview_len];
    // D1 : ne plus inciter file_read du spill (re-gonfle le contexte).
    format!(
        "[drox: tool result for «{tool_name}» — LARGE OUTPUT SPILLED TO DISK]\n\
         Full body ({bytes} bytes) written to: {path}\n\
         Preview (first {preview_len} bytes):\n{preview}\n\
         Do NOT file_read this spill path (re-inflates context). Prefer Explore \
         artifacts / explore_artifact_read, or a short needle on the original source \
         if you must edit. Do NOT re-call the same tool just to re-fetch this blob."
    )
}

/// Stub déjà spillé : garder path + rappel, jeter un long preview résiduel.
fn shorten_existing_spill_stub(content: &str) -> String {
    let path_line = content
        .lines()
        .find(|l| l.contains(".drox/tool-outputs/") || l.contains("written to:"))
        .unwrap_or("Full body on disk under .drox/tool-outputs/");
    // D1 : Preview dropped ≠ invitation à re-lire le spill.
    format!(
        "[drox: tool result — SPILLED FOR CONTEXT (hot snip)]\n\
         {path_line}\n\
         Preview dropped to free context. Do NOT file_read this spill path — use \
         Explore artifacts or a 1–2 line needle on the original source if you must edit."
    )
}

/// Retire `report` éventuel, borne summary/blurb/`artifacts_inline` (C2 merge inject).
#[must_use]
pub(crate) fn slim_task_tool_result_for_llm(value: &Value) -> Value {
    let mut obj = match value {
        Value::Object(map) => map.clone(),
        other => {
            return other.clone();
        }
    };
    let had_report = obj.remove("report").is_some();
    // Plus de conclusion.md — ne pas pointer un report_path fantôme.
    obj.remove("report_path");
    clamp_string_field(&mut obj, "summary", TASK_SUMMARY_MAX_CHARS);
    clamp_string_field(&mut obj, "blurb", TASK_BLURB_MAX_CHARS);
    clamp_artifacts_inline(&mut obj);
    if !obj.contains_key("summary") {
        if obj
            .get("artifacts_inline")
            .and_then(|v| v.as_object())
            .is_some_and(|m| !m.is_empty())
        {
            obj.insert(
                "summary".into(),
                Value::String("See artifacts_inline (merge from kind bodies).".into()),
            );
        } else if let Some(arts) = obj.get("artifacts").and_then(|v| v.as_object()) {
            if let Some((_, path)) = arts.iter().next() {
                if let Some(p) = path.as_str() {
                    obj.insert(
                        "summary".into(),
                        Value::String(format!("See artifacts (e.g. {p}) / explore_artifact_read")),
                    );
                }
            }
        }
    }
    let inline_n = obj
        .get("artifacts_inline")
        .and_then(|v| v.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    debug!(
        marker = "c2.slim_task",
        had_report,
        inline_n,
        summary_len = obj.get("summary").and_then(|v| v.as_str()).map(|s| s.len()),
        blurb_len = obj.get("blurb").and_then(|v| v.as_str()).map(|s| s.len()),
        "dogfood: task outcome slimmed for parent LLM"
    );
    Value::Object(obj)
}

fn clamp_artifacts_inline(obj: &mut Map<String, Value>) {
    let Some(Value::Object(map)) = obj.get_mut("artifacts_inline") else {
        return;
    };
    let keys: Vec<String> = map.keys().cloned().collect();
    for key in keys {
        let Some(Value::String(s)) = map.get(&key) else {
            continue;
        };
        if s.chars().count() <= TASK_INLINE_KIND_MAX_CHARS {
            continue;
        }
        let clipped: String = s.chars().take(TASK_INLINE_KIND_MAX_CHARS).collect();
        map.insert(key, Value::String(format!("{clipped}…")));
    }
}

fn clamp_string_field(obj: &mut Map<String, Value>, key: &str, max_chars: usize) {
    let Some(Value::String(s)) = obj.get(key) else {
        return;
    };
    if s.chars().count() <= max_chars {
        return;
    }
    let clipped: String = s.chars().take(max_chars).collect();
    obj.insert(key.into(), Value::String(format!("{clipped}…")));
}

fn spill_tool_result_to_disk(
    workspace_root: &Utf8Path,
    tool_name: &str,
    body: &str,
) -> std::io::Result<String> {
    let dir = workspace_root.join(".drox").join("tool-outputs");
    std::fs::create_dir_all(dir.as_std_path())?;
    let safe: String = tool_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    let file_name = format!("{stamp}-{safe}.json");
    let path = dir.join(&file_name);
    std::fs::write(path.as_std_path(), body)?;
    Ok(path.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn read_heavy_spills_earlier_than_bash() {
        assert_eq!(
            spill_threshold_for_tool("file_read"),
            READ_HEAVY_SPILL_THRESHOLD_BYTES
        );
        assert_eq!(
            spill_threshold_for_tool("grep"),
            READ_HEAVY_SPILL_THRESHOLD_BYTES
        );
        assert_eq!(
            spill_threshold_for_tool("bash"),
            TOOL_RESULT_SPILL_THRESHOLD_BYTES
        );
    }

    #[test]
    fn format_spills_file_read_at_8kib() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let big = "y".repeat(READ_HEAVY_SPILL_THRESHOLD_BYTES + 50);
        let value = json!({ "content": big });
        let formatted = format_tool_result_for_llm("file_read", &value, &ws);
        assert!(
            formatted.contains("LARGE OUTPUT SPILLED TO DISK"),
            "file_read must spill at 8 KiB; got {}",
            &formatted[..formatted.len().min(160)]
        );
        assert!(
            !formatted.contains(&"y".repeat(2_000)),
            "full blob must not stay in the LLM message"
        );
        assert!(
            formatted.contains("Do NOT file_read this spill path"),
            "D1: spill stub must discourage re-read"
        );
        assert!(
            !formatted.contains("Use `file_read`"),
            "D1: must not invite file_read on spill"
        );
        let preview_cap = TOOL_RESULT_PREVIEW_BYTES + 80;
        let preview_section = formatted
            .split("Preview")
            .nth(1)
            .unwrap_or("");
        assert!(
            preview_section.len() < preview_cap + 200,
            "preview must stay short"
        );
    }

    #[test]
    fn format_keeps_medium_bash_inline() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        // Between 8 KiB and 24 KiB: bash stays inline, file_read would spill.
        let mid = "z".repeat(READ_HEAVY_SPILL_THRESHOLD_BYTES + 100);
        let value = json!({ "stdout": mid });
        let bash = format_tool_result_for_llm("bash", &value, &ws);
        assert!(
            !bash.contains("SPILLED TO DISK"),
            "bash under 24 KiB should stay inline"
        );
        assert!(bash.contains(&mid[..100]));
    }

    #[test]
    fn hot_snip_always_spills_before_stub() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let body = "payload-".repeat(200);
        let stub = stub_for_hot_snip(&ws, &body);
        assert!(stub.contains("SPILLED TO DISK") || stub.contains("tool-outputs"));
        assert!(!stub.contains(&body));
        let out_dir = ws.join(".drox").join("tool-outputs");
        let entries: Vec<_> = std::fs::read_dir(out_dir.as_std_path()).unwrap().collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn slim_task_drops_report_keeps_inline() {
        let value = json!({
            "report": "# huge markdown\n".repeat(100),
            "report_path": ".drox/subagents/ses_x/exp_y/conclusion.md",
            "summary": "S".repeat(900),
            "blurb": "B".repeat(50),
            "artifacts": { "gaps": "g.md" },
            "artifacts_inline": {
                "gaps": "- missing MD pipeline",
                "structure_map": "M".repeat(2_500)
            },
            "truncated": false
        });
        let slim = slim_task_tool_result_for_llm(&value);
        assert!(slim.get("report").is_none());
        assert!(slim.get("report_path").is_none());
        let summary = slim.get("summary").and_then(|v| v.as_str()).unwrap();
        assert!(summary.chars().count() <= TASK_SUMMARY_MAX_CHARS + 1); // + ellipsis
        assert!(summary.ends_with('…'));
        assert_eq!(
            slim.get("blurb").and_then(|v| v.as_str()).unwrap().len(),
            50
        );
        let inline = slim.get("artifacts_inline").and_then(|v| v.as_object()).unwrap();
        assert_eq!(
            inline.get("gaps").and_then(|v| v.as_str()),
            Some("- missing MD pipeline")
        );
        let structure = inline.get("structure_map").and_then(|v| v.as_str()).unwrap();
        assert!(structure.chars().count() <= TASK_INLINE_KIND_MAX_CHARS + 1);
        assert!(structure.ends_with('…'));
    }

    #[test]
    fn hot_snip_shortens_existing_spill_stub() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let existing = format!(
            "[drox: tool result for «grep» — LARGE OUTPUT SPILLED TO DISK]\n\
             Full body (9999 bytes) written to: {}/.drox/tool-outputs/x.json\n\
             Preview (first 512 bytes):\n{}",
            ws,
            "p".repeat(512)
        );
        let stub = stub_for_hot_snip(&ws, &existing);
        assert!(stub.contains("SPILLED FOR CONTEXT"));
        assert!(stub.contains("tool-outputs"));
        assert!(!stub.contains(&"p".repeat(200)));
        assert!(
            stub.contains("Do NOT file_read this spill path"),
            "D1: hot-snip stub must discourage re-read"
        );
        assert!(
            !stub.contains("Re-read the spill"),
            "D1: must not invite re-read after Preview dropped"
        );
        // Pas de second fichier spill.
        let out_dir = ws.join(".drox").join("tool-outputs");
        assert!(!out_dir.exists() || std::fs::read_dir(out_dir.as_std_path()).unwrap().count() == 0);
    }
}
