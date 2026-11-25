//! Coercion JSON guidée par le schéma outil (inspiration Cline A4).

use serde_json::{json, Value};

use crate::normalize_json_like::normalize_json_like_strings;

/// Applique d'abord la normalisation JSON-like globale, puis ajuste selon le schéma.
#[must_use]
pub fn normalize_for_schema(value: Value, schema: &Value) -> Value {
    let peeled = normalize_json_like_strings(value);
    coerce_value(peeled, schema)
}

fn coerce_value(value: Value, schema: &Value) -> Value {
    let types = schema_types(schema);
    if types.is_empty() {
        return value;
    }
    if types.iter().any(|t| *t == "object") && value.is_object() {
        return coerce_object(value, schema);
    }
    if types.iter().any(|t| *t == "array") {
        return coerce_array(value, schema);
    }
    if types.iter().any(|t| *t == "boolean") {
        return coerce_boolean(value);
    }
    if types.iter().any(|t| *t == "integer") {
        return coerce_integer(value);
    }
    if types.iter().any(|t| *t == "number") {
        return coerce_number(value);
    }
    if types.iter().any(|t| *t == "string") {
        return coerce_string(value);
    }
    value
}

fn schema_types(schema: &Value) -> Vec<&str> {
    match schema.get("type") {
        Some(Value::String(s)) => vec![s.as_str()],
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str())
            .collect(),
        _ => Vec::new(),
    }
}

fn coerce_object(value: Value, schema: &Value) -> Value {
    let Value::Object(mut map) = value else {
        return value;
    };
    let props = schema
        .get("properties")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    for (key, prop_schema) in props {
        if let Some(entry) = map.remove(&key) {
            map.insert(key, coerce_value(entry, &prop_schema));
        }
    }
    Value::Object(map)
}

fn coerce_array(value: Value, schema: &Value) -> Value {
    let item_schema = schema.get("items");
    match value {
        Value::Array(items) => {
            let coerced: Vec<Value> = match item_schema {
                Some(s) => items.into_iter().map(|v| coerce_value(v, s)).collect(),
                None => items,
            };
            Value::Array(coerced)
        }
        Value::String(s) if item_schema.is_some() => {
            if let Ok(parsed) = serde_json::from_str::<Value>(&s) {
                return coerce_array(parsed, schema);
            }
            Value::String(s)
        }
        _ => value,
    }
}

fn coerce_boolean(value: Value) -> Value {
    match value {
        Value::Bool(b) => Value::Bool(b),
        Value::String(s) => match s.to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Value::Bool(true),
            "false" | "0" | "no" => Value::Bool(false),
            _ => Value::String(s),
        },
        Value::Number(n) => Value::Bool(n.as_i64().is_some_and(|v| v != 0)),
        other => other,
    }
}

fn coerce_integer(value: Value) -> Value {
    match value {
        Value::Number(n) => Value::Number(n),
        Value::String(s) => parse_number_str(&s, true).unwrap_or(Value::String(s)),
        Value::Bool(b) => json!(if b { 1 } else { 0 }),
        other => other,
    }
}

fn coerce_number(value: Value) -> Value {
    match value {
        Value::Number(n) => Value::Number(n),
        Value::String(s) => parse_number_str(&s, false).unwrap_or(Value::String(s)),
        Value::Bool(b) => json!(if b { 1 } else { 0 }),
        other => other,
    }
}

fn coerce_string(value: Value) -> Value {
    match value {
        Value::String(s) => Value::String(s),
        Value::Bool(b) => Value::String(b.to_string()),
        Value::Number(n) => Value::String(n.to_string()),
        Value::Null => Value::Null,
        other => Value::String(other.to_string()),
    }
}

fn parse_number_str(s: &str, integer: bool) -> Option<Value> {
    let t = s.trim();
    if integer {
        if let Ok(v) = t.parse::<i64>() {
            return Some(json!(v));
        }
        return None;
    }
    if let Ok(v) = t.parse::<f64>() {
        serde_json::Number::from_f64(v).map(Value::Number)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_string_id_when_schema_requests_string() {
        let schema = json!({
            "type": "object",
            "properties": {
                "id": { "type": "string" }
            }
        });
        let out = normalize_for_schema(json!({"id": "1"}), &schema);
        assert_eq!(out["id"], json!("1"));
    }

    #[test]
    fn coerces_bool_from_string() {
        let schema = json!({ "type": "boolean" });
        assert_eq!(
            normalize_for_schema(json!("true"), &schema),
            json!(true)
        );
    }

    #[test]
    fn coerces_nested_object_in_string() {
        let schema = json!({
            "type": "object",
            "properties": {
                "path": { "type": "string" }
            }
        });
        let out = normalize_for_schema(json!("{\"path\":\"a.rs\"}"), &schema);
        assert_eq!(out["path"], json!("a.rs"));
    }

    #[test]
    fn coerces_array_items() {
        let schema = json!({
            "type": "array",
            "items": { "type": "integer" }
        });
        let out = normalize_for_schema(json!(["1", "2"]), &schema);
        assert_eq!(out, json!([1, 2]));
    }
}