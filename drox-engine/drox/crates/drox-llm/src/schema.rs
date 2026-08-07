//! Aplatissement des JSON Schema d’outils pour les backends picky (Ollama).
//!
//! `schemars` émet des `$ref` vers `#/definitions/…`. Certains templates
//! Ollama (souvent GGUF custom) échouent alors avec :
//! `JSON schema conversion failed: Error resolving ref #/definitions/…`.

use serde_json::{Map, Value};

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
}
