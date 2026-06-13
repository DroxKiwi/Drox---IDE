/// Rafraîchit le snapshot en fin d'historique (chaque tour edit, après suppléments E/T).
/// Ne réinjecte pas si le contenu est identique au snapshot déjà présent (context diet).
pub fn refresh_architect_run_snapshot(messages: &mut Vec<Message>, snapshot: &str) {
    if architect_run_snapshot_unchanged(messages, snapshot) {
        tracing::debug!(
            target: "drox.context",
            bytes = snapshot.len(),
            "architect_run_snapshot_skip=unchanged"
        );
        return;
    }
    messages.retain(|m| !is_architect_run_snapshot_message(m));
    messages.push(Message::system(snapshot.to_string()));
    tracing::debug!(
        target: "drox.context",
        bytes = snapshot.len(),
        "architect_run_snapshot_refresh"
    );
}

/// Post-compaction / `todo_write` : une seule copie du snapshot après le checkpoint.
pub fn inject_architect_run_snapshot_after_checkpoint(
    messages: &mut Vec<Message>,
    snapshot: &str,
) {
    if architect_run_snapshot_unchanged(messages, snapshot) {
        return;
    }
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

/// Protocoles outil par station — remplace le bloc boot statique (context diet).
pub const TOOL_PROTOCOL_SNAPSHOT_MARKER: &str = "## Architect tool protocols (engine)";

pub fn refresh_tool_protocol_snapshot(messages: &mut Vec<Message>, snapshot: &str) {
    if snapshot.is_empty() {
        messages.retain(|m| !is_tool_protocol_snapshot_message(m));
        return;
    }
    if tool_protocol_snapshot_unchanged(messages, snapshot) {
        tracing::debug!(
            target: "drox.context",
            bytes = snapshot.len(),
            "tool_protocol_snapshot_skip=unchanged"
        );
        return;
    }
    messages.retain(|m| !is_tool_protocol_snapshot_message(m));
    messages.push(Message::system(snapshot.to_string()));
    tracing::debug!(
        target: "drox.context",
        bytes = snapshot.len(),
        "tool_protocol_snapshot_refresh"
    );
}

fn architect_run_snapshot_unchanged(messages: &[Message], snapshot: &str) -> bool {
    messages.iter().any(|m| {
        is_architect_run_snapshot_message(m) && system_message_text(m) == snapshot
    })
}

fn tool_protocol_snapshot_unchanged(messages: &[Message], snapshot: &str) -> bool {
    messages.iter().any(|m| {
        is_tool_protocol_snapshot_message(m) && system_message_text(m) == snapshot
    })
}

#[must_use]
pub fn is_tool_protocol_snapshot_message(m: &Message) -> bool {
    if !matches!(m.role, Role::System) {
        return false;
    }
    system_message_text(m).contains(TOOL_PROTOCOL_SNAPSHOT_MARKER)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refresh_architect_run_snapshot_skips_unchanged() {
        let snapshot = format!("{ARCHITECT_RUN_SNAPSHOT_MARKER}\n\nuser: test");
        let mut messages = vec![Message::system(snapshot.clone())];
        refresh_architect_run_snapshot(&mut messages, &snapshot);
        assert_eq!(messages.len(), 1);
        let changed = format!("{snapshot}\nupdated");
        refresh_architect_run_snapshot(&mut messages, &changed);
        assert_eq!(messages.len(), 1);
        assert_eq!(system_message_text(&messages[0]), changed);
    }

    #[test]
    fn refresh_tool_protocol_snapshot_replaces_on_station_change() {
        let read_block = "## Architect tool protocols (engine)\n\nread";
        let act_block = "## Architect tool protocols (engine)\n\nact";
        let mut messages = vec![Message::system(read_block.to_string())];
        refresh_tool_protocol_snapshot(&mut messages, read_block);
        assert_eq!(messages.len(), 1);
        refresh_tool_protocol_snapshot(&mut messages, act_block);
        assert_eq!(messages.len(), 1);
        assert!(system_message_text(&messages[0]).contains("act"));
    }
}
