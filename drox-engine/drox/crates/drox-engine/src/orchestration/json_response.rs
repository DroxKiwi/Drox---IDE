//! Extraction JSON — filtre les artefacts gate legacy dans les transcripts.

use serde_json::Value;

/// Réponse assistant plausible pour un tour gate (JSON `open` ou `gate`+`value`).
#[must_use]
pub fn looks_like_gate_json_response(text: &str) -> bool {
    let Some(v) = extract_first_json_object(text) else {
        return false;
    };
    v.get("open").and_then(Value::as_str).is_some()
        || (v.get("gate").and_then(Value::as_str).is_some()
            && v.get("value").and_then(Value::as_bool).is_some())
}

/// Extrait le premier objet JSON `{…}` dans le texte.
#[must_use]
pub fn extract_first_json_object(text: &str) -> Option<Value> {
    let start = text.find('{')?;
    let mut depth = 0i32;
    for (i, ch) in text[start..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    let slice = &text[start..start + i + 1];
                    return serde_json::from_str(slice).ok();
                }
            }
            _ => {}
        }
    }
    None
}
