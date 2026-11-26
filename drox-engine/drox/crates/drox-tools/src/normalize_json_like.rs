//! Coercion JSON-like avant validation d'arguments (sémantique Cline).

use serde_json::Value;

/// Normalise les scalaires JSON encodés en string (`"true"`, `"42"`, etc.).
#[must_use]
pub fn normalize_json_like_strings(value: Value) -> Value {
    match value {
        Value::String(s) => coerce_string_scalar(&s),
        Value::Array(items) => {
            Value::Array(items.into_iter().map(normalize_json_like_strings).collect())
        }
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(k, v)| (k, normalize_json_like_strings(v)))
                .collect(),
        ),
        other => other,
    }
}

fn coerce_string_scalar(s: &str) -> Value {
    let trimmed = s.trim();
    match trimmed {
        "true" | "True" | "TRUE" => Value::Bool(true),
        "false" | "False" | "FALSE" => Value::Bool(false),
        "" => Value::String(s.to_string()),
        _ => {
            // Ne pas convertir les chaînes numériques (`"1"`, `"42"`) — cas fréquent
            // pour `id` d'outils qui attendent des `String`.
            if (trimmed.starts_with('{') && trimmed.ends_with('}'))
                || (trimmed.starts_with('[') && trimmed.ends_with(']'))
            {
                if let Ok(parsed) = serde_json::from_str(trimmed) {
                    return normalize_json_like_strings(parsed);
                }
            }
            Value::String(s.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn coerces_bool_strings() {
        assert_eq!(normalize_json_like_strings(json!("true")), json!(true));
        assert_eq!(normalize_json_like_strings(json!("false")), json!(false));
    }

    #[test]
    fn keeps_numeric_strings_for_ids() {
        let v = json!({ "id": "1", "dry_run": "false" });
        let out = normalize_json_like_strings(v);
        assert_eq!(out["id"], json!("1"));
        assert_eq!(out["dry_run"], json!(false));
    }
}