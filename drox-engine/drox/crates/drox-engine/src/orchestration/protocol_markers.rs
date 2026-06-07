//! Marqueurs déclarés par le **modèle** — le moteur ne déduit pas l'intention depuis des listes de mots.
//!
//! Même philosophie que [`super::architect_mode`] (`[mode: …]`) — marqueurs déclarés par le modèle.

/// Tâche plan sans `delegate_executor` (synthèse / résumé utilisateur).
pub const TASK_META_LINE: &str = "[task: meta]";

/// `ask_user_question` pour déléguer la vérification finale à l'utilisateur.
pub const CYCLE_USER_CHECK_LINE: &str = "[cycle: user_check]";

/// Début de la réponse utilisateur (run `ArchitectDiscussion`) — extraction moteur / UI.
pub const DISCUSSION_REPLY_LINE: &str = "[discussion: reply]";

/// Fin du run discussion — le moteur arrête le tour.
pub const DISCUSSION_DONE_LINE: &str = "[discussion: done]";

/// `task_id` réservé pour le smoke test de fin de cycle.
pub const SANITY_TASK_ID: &str = "sanity";

/// Ids de tâche reconnus comme meta sans marqueur dans le libellé.
const META_TASK_IDS: &[&str] = &["meta", "summary", "synthesis", "user_summary"];

/// Première ligne `[task: meta]` dans le contenu d'une todo.
#[must_use]
pub fn todo_declares_meta_task(content: &str) -> bool {
    content
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .is_some_and(|line| line.eq_ignore_ascii_case(TASK_META_LINE))
}

/// `task_id` explicite pour une ligne meta (convention prompt).
#[must_use]
pub fn is_meta_task_id(task_id: &str) -> bool {
    META_TASK_IDS
        .iter()
        .any(|id| task_id.trim().eq_ignore_ascii_case(id))
}

/// Tâche de synthèse : id réservé **ou** marqueur dans `content`.
#[must_use]
pub fn is_meta_synthesis_task(task_id: &str, todo_content: Option<&str>) -> bool {
    if is_meta_task_id(task_id) {
        return true;
    }
    todo_content.is_some_and(todo_declares_meta_task)
}

/// Parse `[cycle: user_check]` (ligne seule ou en tête de question).
#[must_use]
pub fn parse_cycle_user_check_marker(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.eq_ignore_ascii_case(CYCLE_USER_CHECK_LINE) {
        return true;
    }
    let body = trimmed.strip_prefix('[').and_then(|s| s.strip_suffix(']'));
    let Some(body) = body else {
        return false;
    };
    let (head, raw) = match body.split_once(':') {
        Some(pair) => pair,
        None => return false,
    };
    if !head.trim().eq_ignore_ascii_case("cycle") {
        return false;
    }
    matches!(
        raw.trim().to_ascii_lowercase().as_str(),
        "user_check" | "user-check" | "user_sanity" | "manual_check"
    )
}

/// Texte `ask_user_question` contient un marqueur cycle user-check.
#[must_use]
pub fn ask_payload_declares_cycle_user_check(arguments: &serde_json::Value) -> bool {
    let mut chunks = Vec::new();
    if let Some(questions) = arguments.get("questions").and_then(|v| v.as_array()) {
        for q in questions {
            push_str_field(q, "question", &mut chunks);
            push_str_field(q, "prompt", &mut chunks);
            push_str_field(q, "header", &mut chunks);
        }
    }
    push_str_field(arguments, "question", &mut chunks);
    chunks
        .iter()
        .flat_map(|s| s.lines())
        .any(parse_cycle_user_check_marker)
}

fn push_str_field(obj: &serde_json::Value, key: &str, out: &mut Vec<String>) {
    if let Some(s) = obj.get(key).and_then(|v| v.as_str()) {
        out.push(s.to_string());
    }
}

/// `delegate_executor` déclaré comme sanity via `task_id` (pas de scan npm/cargo/…).
#[must_use]
pub fn delegate_payload_is_sanity_task(arguments: &serde_json::Value) -> bool {
    collect_delegate_task_ids(arguments)
        .iter()
        .any(|id| id.eq_ignore_ascii_case(SANITY_TASK_ID))
}

#[must_use]
pub fn collect_delegate_task_ids(arguments: &serde_json::Value) -> Vec<String> {
    let mut ids = Vec::new();
    if let Some(tasks) = arguments.get("tasks").and_then(|v| v.as_array()) {
        for item in tasks {
            if let Some(id) = item.get("task_id").and_then(|v| v.as_str()) {
                let t = id.trim();
                if !t.is_empty() {
                    ids.push(t.to_string());
                }
            }
        }
    }
    if let Some(id) = arguments.get("task_id").and_then(|v| v.as_str()) {
        let t = id.trim();
        if !t.is_empty() {
            ids.push(t.to_string());
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn meta_task_marker_and_id() {
        assert!(todo_declares_meta_task("[task: meta]\nRédiger le résumé"));
        assert!(is_meta_task_id("summary"));
        assert!(is_meta_synthesis_task(
            "t9",
            Some("[task: meta]\nSynthèse")
        ));
        assert!(!is_meta_synthesis_task("t1", Some("Lire package.json")));
    }

    #[test]
    fn sanity_by_task_id_only() {
        let args = json!({
            "tasks": [{
                "task_id": "sanity",
                "description": "Smoke",
                "instructions": "Run npm test",
                "scope": ["."]
            }]
        });
        assert!(delegate_payload_is_sanity_task(&args));
        let vague = json!({
            "tasks": [{
                "task_id": "t1",
                "description": "Run npm test",
                "instructions": "npm test",
                "scope": ["."]
            }]
        });
        assert!(!delegate_payload_is_sanity_task(&vague));
    }

    #[test]
    fn cycle_user_check_marker() {
        assert!(ask_payload_declares_cycle_user_check(&json!({
            "questions": [{ "question": "[cycle: user_check]\nPouvez-vous lancer les tests ?" }]
        })));
        assert!(!ask_payload_declares_cycle_user_check(&json!({
            "questions": [{ "question": "Quelle couleur préférez-vous ?" }]
        })));
    }
}
