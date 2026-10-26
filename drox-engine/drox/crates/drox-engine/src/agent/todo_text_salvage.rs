//! Filet : JSON `todo_write` collé dans le texte assistant (pas d'appel natif).

use serde_json::Value;

pub(crate) struct SalvagedTodoWrite {
    pub cleaned_text: String,
    pub arguments: Value,
}

/// Si le modèle a écrit `{"todos":[…]}` dans le texte (et aucun tool natif
/// n'est déjà prévu), extraire l'objet et le retirer du texte.
#[must_use]
pub(crate) fn salvage_inline_todo_write(text: &str) -> Option<SalvagedTodoWrite> {
    let (start, end, arguments) = find_todos_object(text)?;
    let todos = arguments.get("todos")?.as_array()?;
    if todos.is_empty() {
        return None;
    }
    if !todos.iter().any(|item| {
        item.get("content")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty())
    }) {
        return None;
    }
    let mut cleaned = String::new();
    cleaned.push_str(text[..start].trim_end());
    let tail = text[end..].trim_start();
    if !cleaned.is_empty() && !tail.is_empty() {
        cleaned.push('\n');
    }
    cleaned.push_str(tail);
    Some(SalvagedTodoWrite {
        cleaned_text: cleaned.trim().to_string(),
        arguments,
    })
}

fn find_todos_object(text: &str) -> Option<(usize, usize, Value)> {
    let mut from = 0;
    while from < text.len() {
        let rel = text[from..].find('{')?;
        let start = from + rel;
        match parse_json_object(&text[start..]) {
            Some((consumed, value))
                if value
                    .get("todos")
                    .and_then(Value::as_array)
                    .is_some_and(|a| !a.is_empty()) =>
            {
                return Some((start, start + consumed, value));
            }
            Some((consumed, _)) => {
                from = start + consumed.max(1);
            }
            None => {
                from = start + 1;
            }
        }
    }
    None
}

fn parse_json_object(slice: &str) -> Option<(usize, Value)> {
    let bytes = slice.as_bytes();
    if bytes.first() != Some(&b'{') {
        return None;
    }
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for (i, ch) in slice.char_indices() {
        if in_str {
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_str = false;
            }
            continue;
        }
        match ch {
            '"' => in_str = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    let end = i + ch.len_utf8();
                    let value: Value = serde_json::from_str(&slice[..end]).ok()?;
                    return Some((end, value));
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn salvages_trailing_todos_json() {
        let raw = "Salut !\n{\"todos\": [{\"id\": \"1\", \"content\": \"Répondre\", \"status\": \"completed\"}]}";
        let s = salvage_inline_todo_write(raw).expect("salvage");
        assert_eq!(s.cleaned_text, "Salut !");
        assert_eq!(s.arguments["todos"][0]["content"], "Répondre");
    }

    #[test]
    fn ignores_text_without_todos() {
        assert!(salvage_inline_todo_write("pas de json ici").is_none());
        assert!(salvage_inline_todo_write("{\"ok\": true}").is_none());
    }

    #[test]
    fn json_only_clears_text() {
        let raw = json!({
            "todos": [{"id": "1", "content": "Lister", "status": "in_progress"}]
        })
        .to_string();
        let s = salvage_inline_todo_write(&raw).expect("salvage");
        assert!(s.cleaned_text.is_empty());
    }
}
