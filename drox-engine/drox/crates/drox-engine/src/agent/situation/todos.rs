//! Indices todo depuis la sortie outil `todo_write`.

/// Contenu du prochain todo (premier `in_progress`, sinon premier `pending`).
#[must_use]
pub(crate) fn next_todo_from_output(value: &serde_json::Value) -> Option<String> {
	let todos = value.get("todos")?.as_array()?;
	let mut pending: Option<String> = None;
	for t in todos {
		let status = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
		let Some(content) = t
			.get("content")
			.and_then(|v| v.as_str())
			.map(str::trim)
			.filter(|s| !s.is_empty())
		else {
			continue;
		};
		if status == "in_progress" {
			return Some(content.to_string());
		}
		if status == "pending" && pending.is_none() {
			pending = Some(content.to_string());
		}
	}
	pending
}

#[must_use]
pub(crate) fn completed_todos_hint(value: &serde_json::Value) -> u64 {
	value
		.get("counts")
		.and_then(|c| c.get("completed"))
		.and_then(|v| v.as_u64())
		.unwrap_or_else(|| {
			value
				.get("todos")
				.and_then(|t| t.as_array())
				.map(|arr| {
					arr.iter()
						.filter(|t| t.get("status").and_then(|v| v.as_str()) == Some("completed"))
						.count() as u64
				})
				.unwrap_or(0)
		})
}
