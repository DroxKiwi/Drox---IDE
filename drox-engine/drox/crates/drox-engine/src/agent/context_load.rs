//! Context-load V1 — score passif après `glob` → N Explore suggéré (soft).
//!
//! Formule : `load = files_effective + ceil(total_kb / kb_divisor)`.
//! Table N : ≤4 → 0 · 5–15 → 1 · 16–35 → 2 · 36–60 → 3 · >60 → 4,
//! puis plafond `max_recommended_n` (+1 si ≥2 racines distinctes sous le workspace).

use std::collections::HashSet;

use serde_json::Value;

/// Politique injectée depuis l'IDE (caps L2).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextLoadPolicy {
    pub inject: bool,
    pub max_recommended_n: u32,
    pub kb_divisor: u32,
}

impl Default for ContextLoadPolicy {
    fn default() -> Self {
        Self {
            inject: false,
            max_recommended_n: 0,
            kb_divisor: 40,
        }
    }
}

/// Snapshot mesuré sur un résultat `glob`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextLoadSnapshot {
    pub files: usize,
    pub directories: usize,
    pub total_kb: u64,
    pub truncated: bool,
    pub omitted_entries: usize,
    pub distinct_roots: usize,
}

/// Résultat du score (suggestion uniquement).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextLoadScore {
    pub load: u64,
    pub recommended_n: u32,
    pub files_effective: usize,
    pub total_kb: u64,
}

/// Parse un tool result `glob` JSON + estime les Ko (échantillon metadata).
pub fn snapshot_from_glob_value(value: &Value, workspace_root: &str) -> Option<ContextLoadSnapshot> {
    let files = value.get("files")?.as_array()?;
    let directories = value
        .get("directories")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let truncated = value
        .get("truncated")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let omitted_entries = value
        .get("directory_fanout_caps")
        .and_then(|v| v.as_array())
        .map(|caps| {
            caps.iter()
                .map(|c| c.get("entries_omitted").and_then(|x| x.as_u64()).unwrap_or(0) as usize)
                .sum()
        })
        .unwrap_or(0);

    let file_paths: Vec<String> = files
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect();
    let dir_paths: Vec<String> = value
        .get("directories")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    let total_kb = estimate_total_kb(&file_paths);
    let distinct_roots = count_distinct_workspace_roots(&file_paths, &dir_paths, workspace_root);

    Some(ContextLoadSnapshot {
        files: file_paths.len(),
        directories,
        total_kb,
        truncated,
        omitted_entries,
        distinct_roots,
    })
}

/// Estime la taille totale (Ko) via un échantillon de metadata fichier.
pub fn estimate_total_kb(file_paths: &[String]) -> u64 {
    const SAMPLE: usize = 80;
    const FALLBACK_AVG_KB: u64 = 8;
    if file_paths.is_empty() {
        return 0;
    }
    let sample: Vec<&String> = file_paths.iter().take(SAMPLE).collect();
    let mut bytes: u64 = 0;
    let mut counted: u64 = 0;
    for p in &sample {
        if let Ok(meta) = std::fs::metadata(p) {
            if meta.is_file() {
                bytes = bytes.saturating_add(meta.len());
                counted = counted.saturating_add(1);
            }
        }
    }
    if counted == 0 {
        return (file_paths.len() as u64).saturating_mul(FALLBACK_AVG_KB);
    }
    let avg = bytes / counted;
    avg.saturating_mul(file_paths.len() as u64) / 1024
}

fn count_distinct_workspace_roots(
    files: &[String],
    dirs: &[String],
    workspace_root: &str,
) -> usize {
    let ws = workspace_root.replace('\\', "/");
    let ws = ws.trim_end_matches('/');
    let mut roots = HashSet::new();
    for p in files.iter().chain(dirs.iter()) {
        let norm = p.replace('\\', "/");
        let rel = match norm.strip_prefix(ws) {
            Some(r) => r.trim_start_matches('/'),
            None => continue,
        };
        if let Some(first) = rel.split('/').next().filter(|s| !s.is_empty()) {
            roots.insert(first.to_string());
        }
    }
    roots.len()
}

/// `load` + `recommended_n` plafonné par la policy (soft).
pub fn score(snapshot: &ContextLoadSnapshot, policy: &ContextLoadPolicy) -> ContextLoadScore {
    let files_effective = snapshot
        .files
        .saturating_add(snapshot.omitted_entries)
        .max(if snapshot.truncated {
            snapshot.files.saturating_mul(2).max(snapshot.files + 20)
        } else {
            snapshot.files
        });

    let div = policy.kb_divisor.max(1) as u64;
    let kb_part = snapshot.total_kb.div_ceil(div);
    let load = (files_effective as u64).saturating_add(kb_part);

    let mut n = recommended_n_from_load(load);
    if snapshot.distinct_roots >= 2 && n > 0 {
        n = n.saturating_add(1);
    }
    if policy.max_recommended_n > 0 {
        n = n.min(policy.max_recommended_n);
    } else {
        n = 0;
    }

    ContextLoadScore {
        load,
        recommended_n: n,
        files_effective,
        total_kb: snapshot.total_kb,
    }
}

fn recommended_n_from_load(load: u64) -> u32 {
    match load {
        0..=4 => 0,
        5..=15 => 1,
        16..=35 => 2,
        36..=60 => 3,
        _ => 4,
    }
}

/// Seuil d'injection : assez de matière pour suggérer ≥1 Explore.
#[must_use]
pub fn should_inject(snapshot: &ContextLoadSnapshot, score: &ContextLoadScore) -> bool {
    score.recommended_n >= 1
        && (snapshot.files.saturating_add(snapshot.omitted_entries) >= 5
            || snapshot.truncated
            || snapshot.omitted_entries > 0
            || score.load >= 5)
}

/// Chemin relatif pour les tests unitaires sans FS.
#[cfg(test)]
pub(crate) fn score_for_test(
    files: usize,
    total_kb: u64,
    omitted: usize,
    truncated: bool,
    distinct_roots: usize,
    max_n: u32,
    kb_div: u32,
) -> ContextLoadScore {
    let snap = ContextLoadSnapshot {
        files,
        directories: 0,
        total_kb,
        truncated,
        omitted_entries: omitted,
        distinct_roots,
    };
    score(
        &snap,
        &ContextLoadPolicy {
            inject: true,
            max_recommended_n: max_n,
            kb_divisor: kb_div,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn table_maps_load_to_n() {
        let s = score_for_test(3, 0, 0, false, 1, 4, 40);
        assert_eq!(s.recommended_n, 0);
        let s = score_for_test(10, 0, 0, false, 1, 4, 40);
        assert_eq!(s.recommended_n, 1);
        let s = score_for_test(20, 0, 0, false, 1, 4, 40);
        assert_eq!(s.recommended_n, 2);
        let s = score_for_test(40, 0, 0, false, 1, 4, 40);
        assert_eq!(s.recommended_n, 3);
        let s = score_for_test(80, 0, 0, false, 1, 4, 40);
        assert_eq!(s.recommended_n, 4);
    }

    #[test]
    fn kb_adds_to_load() {
        // files=10 + ceil(800/40)=20 → load=30 → N=2
        let s = score_for_test(10, 800, 0, false, 1, 4, 40);
        assert_eq!(s.load, 30);
        assert_eq!(s.recommended_n, 2);
    }

    #[test]
    fn max_n_caps_soft() {
        let s = score_for_test(80, 0, 0, false, 1, 3, 40);
        assert_eq!(s.recommended_n, 3);
    }

    #[test]
    fn distinct_roots_bonus_capped() {
        let s = score_for_test(20, 0, 0, false, 2, 3, 40);
        // base N=2 +1 = 3, capped at 3
        assert_eq!(s.recommended_n, 3);
    }

    #[test]
    fn snapshot_parses_glob_json() {
        let v = json!({
            "files": ["C:/ws/docs/a.md", "C:/ws/docs/b.md", "C:/ws/src/c.ts"],
            "directories": ["C:/ws/docs"],
            "truncated": false,
            "directory_fanout_caps": [{
                "entries_omitted": 12
            }]
        });
        let snap = snapshot_from_glob_value(&v, "C:/ws").unwrap();
        assert_eq!(snap.files, 3);
        assert_eq!(snap.directories, 1);
        assert_eq!(snap.omitted_entries, 12);
        assert_eq!(snap.distinct_roots, 2); // docs + src
    }

    #[test]
    fn should_inject_requires_n() {
        let snap = ContextLoadSnapshot {
            files: 10,
            directories: 0,
            total_kb: 0,
            truncated: false,
            omitted_entries: 0,
            distinct_roots: 1,
        };
        let sc = score(
            &snap,
            &ContextLoadPolicy {
                inject: true,
                max_recommended_n: 3,
                kb_divisor: 40,
            },
        );
        assert!(should_inject(&snap, &sc));
        let tiny = ContextLoadSnapshot {
            files: 2,
            ..snap.clone()
        };
        let sc0 = score(
            &tiny,
            &ContextLoadPolicy {
                inject: true,
                max_recommended_n: 3,
                kb_divisor: 40,
            },
        );
        assert!(!should_inject(&tiny, &sc0));
    }
}
