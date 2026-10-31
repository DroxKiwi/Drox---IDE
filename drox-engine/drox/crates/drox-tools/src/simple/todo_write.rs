//! Tool `todo_write` — gestion d'une **to-do list de session** pilotée par
//! l'agent.
//!
//! Inspiré des listes de tâches agent modernes : l'agent maintient une
//! liste d'items avec un statut (`pending` / `in_progress` / `completed` /
//! `cancelled`). Le **moteur** impose au moins un appel `todo_write` par
//! réponse utilisateur, y compris pour une micro-tâche (ex. une seule ligne
//! « Répondre à la question »).
//!
//! ## Modèle stateless
//!
//! Le tool ne stocke **aucun état côté serveur**. À chaque appel, l'agent
//! transmet la **liste complète** (mode replace) et le tool se contente de
//! la **valider** puis de la renvoyer normalisée.
//!
//! Pourquoi ? Le LLM voit chaque output dans son propre transcript : il
//! connaît donc l'état courant parce qu'il vient de l'écrire. Pas de risque
//! de désynchro entre une "vérité serveur" et la vue qu'a le modèle.
//!
//! L'UI (extension VS Code) maintient de son côté un **bloc visuel unique**
//! par session qui s'update en place à chaque `tool_finish`.
//!
//! ## Règles de validation
//!
//! - Au moins **1 item** (liste vide refusée).
//! - Les `id` doivent être **uniques** et non vides.
//! - Le `content` de chaque item doit être non vide.
//! - **Au plus un seul** item en `in_progress` à la fois (règle calquée sur
//!   contrainte agent : on ne peut pas travailler sur deux choses simultanément).
//!
//! En cas de violation, l'erreur retournée est `ToolError::InvalidArgs` avec
//! un message clair que le modèle peut lire et corriger.

use std::collections::HashSet;

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::tool_context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

/// Statut d'un item de la to-do list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(rename_all = "snake_case")]
pub enum TodoStatus {
    /// Étape pas encore commencée.
    Pending,
    /// Étape en cours. **Au plus une seule** à la fois.
    InProgress,
    /// Étape terminée avec succès.
    Completed,
    /// Étape annulée / plus pertinente. Reste visible dans l'UI pour
    /// montrer l'historique de la planification.
    Cancelled,
}

/// Un item de la to-do list.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct TodoItem {
    /// Identifiant stable de l'item dans cette session (ex. `"1"`, `"a"`,
    /// `"step-2"`). Conserve **le même id** d'un appel à l'autre pour que
    /// l'UI mette à jour la bonne ligne au lieu d'en créer une nouvelle.
    pub id: String,
    /// Description courte de l'étape (1 phrase de l'ordre de 3-10 mots).
    pub content: String,
    /// Statut courant.
    pub status: TodoStatus,
}

/// Payload reçu par le tool `todo_write`.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoWriteInput {
    /// Liste **complète** des items — mode replace. À chaque appel, fournis
    /// tous les items (y compris ceux déjà complétés), pas seulement les
    /// nouveaux : l'état précédent est écrasé.
    pub todos: Vec<TodoItem>,
}

/// Tool local `todo_write`. Stateless : valide, normalise, renvoie.
pub struct TodoWriteTool;

/// Compte les items par statut. Sérialisé tel quel dans l'output JSON.
#[derive(Debug, Default, Serialize)]
struct TodoCounts {
    pending: usize,
    in_progress: usize,
    completed: usize,
    cancelled: usize,
}

impl TodoCounts {
    fn from_items(items: &[TodoItem]) -> Self {
        let mut c = Self::default();
        for it in items {
            match it.status {
                TodoStatus::Pending => c.pending += 1,
                TodoStatus::InProgress => c.in_progress += 1,
                TodoStatus::Completed => c.completed += 1,
                TodoStatus::Cancelled => c.cancelled += 1,
            }
        }
        c
    }

    fn summary(&self, total: usize) -> String {
        format!(
            "{total} todos: {} pending · {} in_progress · {} completed · {} cancelled",
            self.pending, self.in_progress, self.completed, self.cancelled
        )
    }
}

#[async_trait]
impl Tool for TodoWriteTool {
    fn name(&self) -> &str {
        "todo_write"
    }

    fn description(&self) -> &str {
        drox_prompts::TODO_WRITE_TOOL_DESCRIPTION
    }

    fn input_schema(&self) -> Value {
        let mut schema =
            serde_json::to_value(schemars::schema_for!(TodoWriteInput)).unwrap_or(Value::Null);
        // schemars met `status` en `allOf` + `$ref` vers un `oneOf` de chaînes
        // (à cause des docs de l'enum). Les grammaires LiteLLM remplissent alors `{}`.
        flatten_todo_status_schema(&mut schema);
        schema
    }

    async fn execute(&self, _ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let normalized = normalize_input(input)?;
        let args: TodoWriteInput = serde_json::from_value(normalized).map_err(|e| {
            ToolError::invalid_args(format!(
                "todo_write: invalid JSON payload ({e}). \
                 Expected format: {{\"todos\": [{{\"id\": \"1\", \"content\": \"…\", \"status\": \"pending|in_progress|completed|cancelled\"}}]}}."
            ))
        })?;
        validate(&args.todos)?;
        let counts = TodoCounts::from_items(&args.todos);
        let summary = counts.summary(args.todos.len());
        Ok(json!({
            "todos": args.todos,
            "counts": counts,
            "summary": summary,
        }))
    }
}

/// Rattrape les formes JSON courantes envoyées par des LLM peu fiables sur
/// les schémas. Si on reçoit :
/// - un **tableau** `[{...}, {...}]` → on le wrappe en `{ "todos": [...] }`.
/// - un **objet** avec `id` / `content` / `status` (item seul à plat) → idem.
/// - un objet avec `todo` au singulier ou `items` → on remappe vers `todos`.
///
/// Le `status` n'est accepté que comme une des quatre chaînes. `{}`, null,
/// un objet ou un mot inconnu font échouer l'appel : on n'enregistre pas
/// `pending` à la place.
fn normalize_input(input: Value) -> Result<Value, ToolError> {
    use serde_json::map::Map;
    let wrapped = match input {
        Value::Array(items) => json!({ "todos": items }),
        Value::Object(mut obj) => {
            if obj.contains_key("todos") {
                Value::Object(obj)
            } else if let Some(v) = obj.remove("todo") {
                let arr = if v.is_array() { v } else { Value::Array(vec![v]) };
                let mut out = Map::new();
                out.insert("todos".into(), arr);
                Value::Object(out)
            } else if let Some(v) = obj.remove("items") {
                let mut out = Map::new();
                out.insert("todos".into(), v);
                Value::Object(out)
            } else if obj.contains_key("id")
                || obj.contains_key("content")
                || obj.contains_key("status")
            {
                json!({ "todos": [Value::Object(obj)] })
            } else {
                Value::Object(obj)
            }
        }
        other => other,
    };
    require_todo_status_strings(wrapped)
}

const TODO_STATUS_VALUES: &str = "pending, in_progress, completed, cancelled";

fn status_string_enum() -> Value {
    json!({
        "type": "string",
        "enum": ["pending", "in_progress", "completed", "cancelled"]
    })
}

fn points_at_todo_status(map: &serde_json::Map<String, Value>) -> bool {
    const REF: &str = "#/definitions/TodoStatus";
    if map.get("$ref").and_then(Value::as_str) == Some(REF) {
        return true;
    }
    let Some(Value::Array(branches)) = map.get("allOf") else {
        return false;
    };
    branches.len() == 1
        && branches
            .first()
            .and_then(Value::as_object)
            .and_then(|branch| branch.get("$ref"))
            .and_then(Value::as_str)
            == Some(REF)
}

/// Remplace le schéma `status` par une énumération de chaînes, définition comprise.
fn flatten_todo_status_schema(node: &mut Value) {
    let flat = status_string_enum();
    match node {
        Value::Array(items) => {
            for item in items {
                flatten_todo_status_schema(item);
            }
        }
        Value::Object(map) => {
            if points_at_todo_status(map) {
                *node = flat;
                return;
            }
            if let Some(Value::Object(defs)) = map.get_mut("definitions") {
                if defs.contains_key("TodoStatus") {
                    defs.insert("TodoStatus".into(), flat);
                }
            }
            let keys: Vec<String> = map.keys().cloned().collect();
            for key in keys {
                if let Some(child) = map.get_mut(&key) {
                    flatten_todo_status_schema(child);
                }
            }
        }
        _ => {}
    }
}

fn canonical_todo_status(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().replace('-', "_").as_str() {
        "pending" => Some("pending"),
        "in_progress" => Some("in_progress"),
        "completed" => Some("completed"),
        "cancelled" | "canceled" => Some("cancelled"),
        _ => None,
    }
}

fn todo_status_error(id: &str, got: &str) -> ToolError {
    ToolError::invalid_args(format!(
        "todo_write: item `{id}` has invalid status ({got}). \
         Use one of: {TODO_STATUS_VALUES}. Nothing was saved."
    ))
}

/// `status` doit être une des quatre chaînes. La casse et `canceled` sont
/// ramenés à la forme canonique. Toute autre forme est une erreur.
fn require_todo_status_strings(input: Value) -> Result<Value, ToolError> {
    let Value::Object(mut root) = input else {
        return Ok(input);
    };
    let Some(Value::Array(items)) = root.get_mut("todos") else {
        return Ok(Value::Object(root));
    };
    for item in items.iter_mut() {
        let Value::Object(obj) = item else {
            continue;
        };
        let id = obj
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("?")
            .to_string();
        match obj.get("status").cloned() {
            Some(Value::String(s)) => {
                let Some(canon) = canonical_todo_status(&s) else {
                    return Err(todo_status_error(&id, &format!("\"{s}\"")));
                };
                obj.insert("status".into(), Value::String(canon.into()));
            }
            Some(other) => {
                return Err(todo_status_error(&id, &other.to_string()));
            }
            None => {
                return Err(todo_status_error(&id, "missing"));
            }
        }
    }
    Ok(Value::Object(root))
}

/// Vérifie les invariants : ≥ 1 item, ids uniques non vides, content non
/// vide, ≤ 1 `in_progress`. Renvoie `InvalidArgs` avec un message
/// auto-explicatif pour que le modèle puisse corriger sans relire la doc.
fn validate(items: &[TodoItem]) -> Result<(), ToolError> {
    if items.is_empty() {
        return Err(ToolError::invalid_args(
            "todo_write needs at least one non-empty todo item",
        ));
    }
    let mut seen_ids = HashSet::with_capacity(items.len());
    let mut in_progress_count = 0usize;
    for (i, item) in items.iter().enumerate() {
        let id = item.id.trim();
        if id.is_empty() {
            return Err(ToolError::invalid_args(format!(
                "todo_write: item #{i} has empty `id`",
            )));
        }
        if !seen_ids.insert(id.to_string()) {
            return Err(ToolError::invalid_args(format!(
                "todo_write: duplicate id `{id}` — each item must have a unique id",
            )));
        }
        if item.content.trim().is_empty() {
            return Err(ToolError::invalid_args(format!(
                "todo_write: item `{id}` has empty `content`",
            )));
        }
        if matches!(item.status, TodoStatus::InProgress) {
            in_progress_count += 1;
        }
    }
    if in_progress_count > 1 {
        return Err(ToolError::invalid_args(format!(
            "todo_write: only one item can be `in_progress` at a time \
             (found {in_progress_count}). Mark the others as `pending`.",
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;

    fn item(id: &str, content: &str, status: TodoStatus) -> TodoItem {
        TodoItem {
            id: id.to_string(),
            content: content.to_string(),
            status,
        }
    }

    fn ctx() -> ToolContext {
        ToolContext::new(Utf8PathBuf::from("/tmp"), false)
    }

    #[test]
    fn schema_lists_all_statuses() {
        let schema = TodoWriteTool.input_schema();
        let status = &schema["definitions"]["TodoItem"]["properties"]["status"];
        assert_eq!(status["type"], "string");
        assert_eq!(
            status["enum"],
            json!(["pending", "in_progress", "completed", "cancelled"])
        );
        assert!(status.get("allOf").is_none(), "{status}");
        assert!(status.get("oneOf").is_none(), "{status}");
        assert!(status.get("$ref").is_none(), "{status}");
        assert_eq!(schema["definitions"]["TodoStatus"]["type"], "string");
    }

    #[tokio::test]
    async fn happy_path_returns_normalized_list_with_counts() {
        let payload = json!({
            "todos": [
                { "id": "1", "content": "Lire X", "status": "in_progress" },
                { "id": "2", "content": "Modifier Y", "status": "pending" },
                { "id": "3", "content": "Tester", "status": "pending" },
            ]
        });
        let out = TodoWriteTool.execute(&ctx(), payload).await.unwrap();
        assert_eq!(out["counts"]["in_progress"], 1);
        assert_eq!(out["counts"]["pending"], 2);
        assert_eq!(out["counts"]["completed"], 0);
        assert_eq!(out["todos"].as_array().unwrap().len(), 3);
        assert!(
            out["summary"].as_str().unwrap().contains("1 in_progress"),
            "summary must mention in_progress count"
        );
    }

    #[tokio::test]
    async fn accepts_single_item() {
        let payload = json!({
            "todos": [
                { "id": "1", "content": "Répondre à la question", "status": "in_progress" },
            ]
        });
        let out = TodoWriteTool.execute(&ctx(), payload).await.unwrap();
        assert_eq!(out["counts"]["pending"], 0);
        assert_eq!(out["counts"]["in_progress"], 1);
        assert_eq!(out["todos"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn rejects_empty_todo_list() {
        let payload = json!({ "todos": [] });
        let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
        assert!(
            matches!(err, ToolError::InvalidArgs(ref m) if m.contains("at least one")),
            "got {err:?}"
        );
    }

    #[tokio::test]
    async fn rejects_duplicate_ids() {
        let payload = json!({
            "todos": [
                { "id": "a", "content": "step 1", "status": "pending" },
                { "id": "a", "content": "step 2", "status": "pending" },
            ]
        });
        let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
        assert!(
            matches!(err, ToolError::InvalidArgs(ref m) if m.contains("duplicate id")),
            "got {err:?}"
        );
    }

    #[tokio::test]
    async fn rejects_multiple_in_progress() {
        let payload = json!({
            "todos": [
                { "id": "1", "content": "A", "status": "in_progress" },
                { "id": "2", "content": "B", "status": "in_progress" },
            ]
        });
        let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
        assert!(
            matches!(err, ToolError::InvalidArgs(ref m) if m.contains("one item")),
            "got {err:?}"
        );
    }

    #[tokio::test]
    async fn rejects_empty_content() {
        let payload = json!({
            "todos": [
                { "id": "1", "content": "  ", "status": "pending" },
                { "id": "2", "content": "Test", "status": "pending" },
            ]
        });
        let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
        assert!(
            matches!(err, ToolError::InvalidArgs(ref m) if m.contains("empty `content`")),
            "got {err:?}"
        );
    }

    #[tokio::test]
    async fn tolerates_flat_single_item_payload() {
        // Cas observé en prod : le modèle envoie l'item à plat, sans wrapper
        // `todos`. On rattrape au lieu de boucler sur l'erreur de parse.
        let payload = json!({ "id": "1", "content": "Saluer", "status": "in_progress" });
        let out = TodoWriteTool.execute(&ctx(), payload).await.unwrap();
        assert_eq!(out["todos"].as_array().unwrap().len(), 1);
        assert_eq!(out["counts"]["in_progress"], 1);
    }

    #[tokio::test]
    async fn tolerates_bare_array_payload() {
        // Modèle envoie directement le tableau sans wrapper.
        let payload = json!([
            { "id": "1", "content": "A", "status": "pending" },
            { "id": "2", "content": "B", "status": "in_progress" },
        ]);
        let out = TodoWriteTool.execute(&ctx(), payload).await.unwrap();
        assert_eq!(out["todos"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn tolerates_singular_todo_key() {
        let payload =
            json!({ "todo": { "id": "1", "content": "Saluer", "status": "in_progress" } });
        let out = TodoWriteTool.execute(&ctx(), payload).await.unwrap();
        assert_eq!(out["todos"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn empty_status_object_is_rejected() {
        let payload = json!({
            "todos": [
                { "content": "Analyser le projet", "id": "1", "status": {} },
            ]
        });
        let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("invalid status"), "{msg}");
        assert!(msg.contains("pending, in_progress, completed, cancelled"), "{msg}");
        assert!(msg.contains("`1`"), "{msg}");
    }

    #[tokio::test]
    async fn null_and_missing_status_are_rejected() {
        let null_status = json!({
            "todos": [ { "id": "1", "content": "A", "status": null } ]
        });
        let missing = json!({
            "todos": [ { "id": "2", "content": "B" } ]
        });
        for payload in [null_status, missing] {
            let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
            assert!(err.to_string().contains("invalid status"), "{}", err);
        }
    }

    #[tokio::test]
    async fn status_object_is_rejected() {
        let payload = json!({
            "todos": [
                { "id": "1", "content": "A", "status": { "in_progress": null } },
            ]
        });
        let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
        assert!(err.to_string().contains("invalid status"), "{err}");
    }

    #[tokio::test]
    async fn u1_normalizes_status_casing_and_canceled_alias() {
        let payload = json!({
            "todos": [
                { "id": "1", "content": "A", "status": "Pending" },
                { "id": "2", "content": "B", "status": "canceled" },
            ]
        });
        let out = TodoWriteTool.execute(&ctx(), payload).await.unwrap();
        assert_eq!(out["todos"][0]["status"], "pending");
        assert_eq!(out["todos"][1]["status"], "cancelled");
    }

    #[tokio::test]
    async fn malformed_payload_yields_self_explanatory_error() {
        // Pas d'`id` → on doit dire au modèle quel format on attend, pas
        // juste « missing field `id` » qui ne lui parle pas.
        let payload = json!({ "todos": [ { "content": "Saluer", "status": "in_progress" } ] });
        let err = TodoWriteTool.execute(&ctx(), payload).await.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("todo_write") && msg.contains("\"todos\""),
            "expected schema hint in error, got: {msg}"
        );
    }

    #[test]
    fn validate_accepts_all_completed() {
        let items = vec![
            item("1", "A", TodoStatus::Completed),
            item("2", "B", TodoStatus::Completed),
        ];
        validate(&items).expect("all-completed list is valid");
    }
}
