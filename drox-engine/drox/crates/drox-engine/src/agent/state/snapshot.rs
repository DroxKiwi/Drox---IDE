/// Rafraîchit le snapshot en fin d'historique (chaque tour edit, après suppléments E/T).
pub fn refresh_architect_run_snapshot(messages: &mut Vec<Message>, snapshot: &str) {
    messages.retain(|m| !is_architect_run_snapshot_message(m));
    messages.push(Message::system(snapshot.to_string()));
}

/// Post-compaction / `todo_write` : une seule copie du snapshot après le checkpoint.
pub fn inject_architect_run_snapshot_after_checkpoint(
    messages: &mut Vec<Message>,
    snapshot: &str,
) {
    messages.retain(|m| !is_architect_run_snapshot_message(m));
    let insert_at = messages
        .iter()
        .position(is_context_checkpoint_message)
        .map(|i| i + 1)
        .unwrap_or_else(|| {
            messages
                .iter()
                .take_while(|m| matches!(m.role, Role::System))
                .count()
                .max(1)
        });
    messages.insert(insert_at, Message::system(snapshot.to_string()));
}

#[must_use]
pub fn is_architect_run_snapshot_message(m: &Message) -> bool {
    if !matches!(m.role, Role::System) {
        return false;
    }
    let text = system_message_text(m);
    text.contains(ARCHITECT_RUN_SNAPSHOT_MARKER)
}

#[must_use]
pub(super) fn system_message_text(m: &Message) -> String {
    if matches!(m.role, Role::System) {
        Content::collapse_text(&m.content)
    } else {
        String::new()
    }
}
