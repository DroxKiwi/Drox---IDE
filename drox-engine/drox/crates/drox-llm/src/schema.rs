//! Aplatissement des JSON Schema d’outils pour les backends picky (Ollama).
//!
//! `schemars` émet des `$ref` vers `#/definitions/…`. Certains templates
//! Ollama (souvent GGUF custom) échouent alors avec :
//! `JSON schema conversion failed: Error resolving ref #/definitions/…`.

use serde_json::{Map, Value};

/// Paramètres d’outil pour `/api/chat` Ollama (GGUF picky, ex. Ornith).
///
/// llama.cpp exige `properties` **objet** dès que le nœud est un `object`.
/// `schemars` omet souvent `properties` (struct vide) ou sérialise `null`.
#[must_use]
pub fn ollama_tool_parameters(schema: &Value) -> Value {
    let mut out = inline_json_schema_refs(schema);
    ensure_object_properties(&mut out, true);
    if !out.is_object() {
        return serde_json::json!({ "type": "object", "properties": {} });
    }
    out
}

/// Branches `anyOf` / `oneOf` / `allOf` toutes de forme objet (pas d'enum string).
fn combinator_branches_all_objects(map: &Map<String, Value>) -> bool {
    let mut any = false;
    for key in ["anyOf", "oneOf", "allOf"] {
        let Some(Value::Array(arr)) = map.get(key) else {
            continue;
        };
        for branch in arr {
            any = true;
            let Some(b) = branch.as_object() else {
                return false;
            };
            let object_like = match b.get("type") {
                Some(Value::String(s)) => s == "object",
                Some(_) => false,
                None => b.contains_key("properties") || combinator_branches_all_objects(b),
            };
            if !object_like {
                return false;
            }
        }
    }
    any
}

fn ensure_object_properties(node: &mut Value, is_root: bool) {
    match node {
        Value::Object(map) => {
            let has_combinator = map.contains_key("anyOf")
                || map.contains_key("oneOf")
                || map.contains_key("allOf");
            let is_object = match map.get("type") {
                Some(Value::String(s)) => s == "object",
                Some(Value::Array(arr)) => arr.iter().any(|t| t.as_str() == Some("object")),
                _ => {
                    (has_combinator && (is_root || combinator_branches_all_objects(map)))
                        || map.contains_key("properties")
                        || map.contains_key("required")
                        || map.contains_key("additionalProperties")
                }
            };
            if is_object && !matches!(map.get("properties"), Some(Value::Object(_))) {
                if has_combinator && map.get("type").is_none() {
                    map.insert("type".to_string(), Value::String("object".to_string()));
                }
                map.insert("properties".to_string(), Value::Object(Map::new()));
            }
            const NEST: [&str; 6] = ["properties", "items", "additionalProperties", "anyOf", "oneOf", "allOf"];
            for key in NEST {
                if let Some(child) = map.get_mut(key) {
                    match child {
                        Value::Object(inner) if key == "properties" => {
                            for v in inner.values_mut() {
                                ensure_object_properties(v, false);
                            }
                        }
                        Value::Array(arr) => {
                            for v in arr {
                                ensure_object_properties(v, false);
                            }
                        }
                        other => ensure_object_properties(other, false),
                    }
                }
            }
        }
        Value::Array(arr) => {
            for v in arr {
                ensure_object_properties(v, false);
            }
        }
        _ => {}
    }
}

/// Inline `#/definitions/X` et `#/$defs/X`, puis retire `definitions` / `$defs` / `$schema`.
#[must_use]
pub fn inline_json_schema_refs(schema: &Value) -> Value {
    let mut root = schema.clone();
    let Some(obj) = root.as_object_mut() else {
        return root;
    };

    let mut defs = Map::new();
    if let Some(Value::Object(d)) = obj.remove("definitions") {
        defs.extend(d);
    }
    if let Some(Value::Object(d)) = obj.remove("$defs") {
        defs.extend(d);
    }
    obj.remove("$schema");

    let inlined = inline_node(&Value::Object(obj.clone()), &defs, 0);
    match inlined {
        Value::Object(mut o) => {
            o.remove("definitions");
            o.remove("$defs");
            o.remove("$schema");
            Value::Object(o)
        }
        other => other,
    }
}

fn inline_node(node: &Value, defs: &Map<String, Value>, depth: usize) -> Value {
    // Garde-fou récursion (schémas mutuellement référencés).
    if depth > 32 {
        return node.clone();
    }
    match node {
        Value::Object(map) => {
            if let Some(Value::String(r)) = map.get("$ref") {
                if let Some(name) = def_name_from_ref(r) {
                    if let Some(target) = defs.get(name) {
                        return inline_node(target, defs, depth + 1);
                    }
                }
            }
            let mut out = Map::new();
            for (k, v) in map {
                if k == "$ref" {
                    continue;
                }
                out.insert(k.clone(), inline_node(v, defs, depth + 1));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(|item| inline_node(item, defs, depth + 1))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn def_name_from_ref(r: &str) -> Option<&str> {
    r.strip_prefix("#/definitions/")
        .or_else(|| r.strip_prefix("#/$defs/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn inlines_definitions_ref() {
        let schema = json!({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "edits": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/EditOp" }
                }
            },
            "definitions": {
                "EditOp": {
                    "type": "object",
                    "properties": {
                        "old_string": { "type": "string" },
                        "new_string": { "type": "string" }
                    },
                    "required": ["old_string", "new_string"]
                }
            }
        });
        let out = inline_json_schema_refs(&schema);
        assert!(out.get("definitions").is_none());
        assert!(out.get("$schema").is_none());
        let items = &out["properties"]["edits"]["items"];
        assert_eq!(items["type"], "object");
        assert_eq!(items["properties"]["old_string"]["type"], "string");
        assert!(items.get("$ref").is_none());
    }

    #[test]
    fn leaves_plain_schema_untouched() {
        let schema = json!({
            "type": "object",
            "properties": { "path": { "type": "string" } }
        });
        assert_eq!(inline_json_schema_refs(&schema), schema);
    }

    #[test]
    fn empty_object_schema_gets_properties_object() {
        let schema = json!({ "type": "object" });
        let out = ollama_tool_parameters(&schema);
        assert_eq!(out["type"], "object");
        assert!(out["properties"].is_object());
        assert_eq!(out["properties"].as_object().unwrap().len(), 0);
    }

    #[test]
    fn null_schema_becomes_empty_object() {
        let out = ollama_tool_parameters(&Value::Null);
        assert_eq!(out["type"], "object");
        assert!(out["properties"].is_object());
    }

    #[test]
    fn nested_object_without_properties_is_filled() {
        let schema = json!({
            "type": "object",
            "properties": {
                "meta": { "type": "object" }
            }
        });
        let out = ollama_tool_parameters(&schema);
        assert!(out["properties"]["meta"]["properties"].is_object());
    }

    #[test]
    fn untagged_enum_anyof_root_gets_object_properties() {
        let schema = json!({
            "anyOf": [
                { "type": "object", "properties": { "a": { "type": "string" } } },
                { "type": "object", "properties": { "b": { "type": "string" } } }
            ]
        });
        let out = ollama_tool_parameters(&schema);
        assert_eq!(out["type"], "object");
        assert!(out["properties"].is_object());
        assert!(out.get("anyOf").is_some());
    }

    #[test]
    fn documented_string_enum_oneof_is_not_turned_into_object() {
        let schema = json!({
            "type": "object",
            "properties": {
                "status": {
                    "oneOf": [
                        { "description": "Not started.", "type": "string", "enum": ["pending"] },
                        { "description": "Done.", "type": "string", "enum": ["completed"] }
                    ]
                }
            }
        });
        let out = ollama_tool_parameters(&schema);
        let status = &out["properties"]["status"];
        assert!(status.get("type").is_none(), "{status}");
        assert!(status.get("properties").is_none(), "{status}");
        assert_eq!(status["oneOf"][0]["type"], "string");
    }

    #[test]
    fn nested_anyof_of_objects_gets_properties() {
        let schema = json!({
            "type": "object",
            "properties": {
                "q": { "anyOf": [
                    { "type": "object", "properties": { "a": { "type": "string" } } },
                    { "type": "object", "properties": { "b": { "type": "string" } } }
                ] }
            }
        });
        let out = ollama_tool_parameters(&schema);
        assert_eq!(out["properties"]["q"]["type"], "object");
        assert!(out["properties"]["q"]["properties"].is_object());
    }

    #[test]
    fn nullable_anyof_stays_untyped() {
        let schema = json!({
            "type": "object",
            "properties": {
                "n": { "anyOf": [ { "type": "integer" }, { "type": "null" } ] }
            }
        });
        let out = ollama_tool_parameters(&schema);
        assert!(out["properties"]["n"].get("type").is_none());
        assert!(out["properties"]["n"].get("properties").is_none());
    }
}
