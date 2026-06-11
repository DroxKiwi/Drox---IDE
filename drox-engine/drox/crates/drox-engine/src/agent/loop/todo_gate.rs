/// Message de gate `todo_write` (pas d'escalade legacy completion/delegate).
#[must_use]
pub(crate) fn escalate_todo_completion_gate_message(message: &str, streak: &mut u32) -> String {
    *streak = 0;
    message.to_string()
}
