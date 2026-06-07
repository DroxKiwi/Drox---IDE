//! Nudges liés à l'exploration structurelle du repo (phase `analyzing`).

/// Rappel protocolaire — **sans** inférer l'intention depuis le texte utilisateur.
///
/// Déclenché quand l'architecte enchaîne des outils d'exploration sans avoir
/// annoncé `[phase: analyzing]` (voir `loop.rs`).
pub(crate) const ANALYZING_PHASE_NUDGE: &str = "[NUDGE] Structural repo exploration in progress.\n\
Prefer **`[phase: analyzing]`** on its own line (not generic `[phase: reading]`) for this pass.\n\
Playbook: `workspace_map_read` if the workspace map is fresh → targeted `glob` (not blind root rescans) \
→ `grep` + `file_read` with line ranges → `lsp` entry points.\n\
Treat `directory_fanout_caps` / `truncated` as signals to refine paths, not as errors.\n\
Keep notes telegraphic inside `analyzing`; put the full structured report only in `[phase: answering]`.";
