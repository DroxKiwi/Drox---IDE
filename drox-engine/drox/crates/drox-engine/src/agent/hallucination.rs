//! Détection des appels d'outils hallucinés du type `phase:done`.

use serde_json::Value;

/// GLM-4.7-Flash / Qwen confondent parfois le marqueur texte `[phase: done]`
/// avec le mécanisme natif `tool_calls` : ils émettent un outil nommé
/// `phase` / `phase:` avec `{\"done\": \"\"}`. Ce n'est pas un outil Drox ;
/// côté permissions les outils inconnus tombent en **Ask** → l'extension
/// refuse sans asker explicite → message trompeur « User denied permission
/// for `phase:` ». On intercepte **avant** `check_permission` et on renvoie
/// une erreur explicite pour éviter la boucle « acting → réécriture finale ».
pub(crate) const PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL: &str = "You tried to invoke a tool named \
    `phase` (or similar) with JSON arguments like `{ \"done\": … }`. That is a \
    misunderstanding: **phase markers are NOT tools**. They MUST appear as \
    **plain text lines** in your assistant message — e.g. `[phase: done]` alone \
    on its own line after your final Markdown answer. Do NOT use `tool_calls` to \
    simulate the protocol. In your NEXT reply, output the literal text line \
    `[phase: done]` (no function call for it). Do NOT rewrite your whole answer \
    unless you still have real work left.";

/// Détecte les `tool_calls` qui mimiquent le protocole `[phase: …]`.
///
/// Qwen / GLM émettent souvent le marqueur **comme nom d'outil** (parfois avec
/// crochets littéraux, parfois avec du XML tronqué collé : `[phase: testing]\n</parameter`).
/// Sans cette détection, le registry renvoie `unknown tool:` et le modèle retente
/// en boucle au lieu de recevoir le nudge « phase = texte, pas tool ».
#[must_use]
pub(crate) fn is_hallucinated_phase_tool_call(name: &str, arguments: &Value) -> bool {
    let raw = name.trim().to_ascii_lowercase();
    // Forme littérale `[phase: …]` — même si du junk XML suit sur la même string.
    if raw.contains("[phase:") {
        return true;
    }

    // Première « ligne » / fragment avant junk XML souvent collé par le codec outil.
    let fragment = raw
        .split(['\n', '\r', '<', '>'])
        .next()
        .unwrap_or(raw.as_str())
        .trim()
        .trim_matches(|c: char| c == '[' || c == ']' || c == '"' || c == '\'');
    let core = fragment.trim_end_matches(':').trim();
    if let Some((head, _rest)) = core.split_once(':') {
        if head.trim() == "phase" {
            return true;
        }
    }
    if core == "phase" {
        return true;
    }
    if core == "set_phase" || core.starts_with("phase_") {
        return true;
    }
    // Motif fréquent : outil `done` avec seule clé `done` (vide) — confusion avec `[phase: done]`.
    if core == "done"
        && arguments
            .as_object()
            .is_some_and(|m| m.len() == 1 && m.contains_key("done"))
    {
        return true;
    }
    false
}
