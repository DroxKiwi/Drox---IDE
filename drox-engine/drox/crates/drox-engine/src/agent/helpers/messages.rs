use drox_types::{Content, Message, Role};
/// Extrait le premier message `user` du run sous forme texte (concatÃ¨ne les
/// blocs `Content::Text`). UtilisÃ© comme **slug fallback** pour les sessions
/// archivÃ©es quand la compaction ne livre pas d'`## Objective` exploitable.
///
/// Retourne `None` si aucun message `user` n'a (encore) de texte â€”
/// l'appelant utilisera alors un slug gÃ©nÃ©rique (`"session"`).
fn user_message_text(m: &Message) -> Option<String> {
    if !matches!(m.role, Role::User) {
        return None;
    }
    let mut buf = String::new();
    for block in &m.content {
        if let Content::Text { text } = block {
            if !buf.is_empty() {
                buf.push(' ');
            }
            buf.push_str(text);
        }
    }
    let trimmed = buf.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn first_user_text(messages: &[Message]) -> Option<String> {
    for m in messages {
        if let Some(t) = user_message_text(m) {
            return Some(t);
        }
    }
    None
}

/// Dernier message `user` non vide (message courant en session multi-tours).
pub(crate) fn last_user_text(messages: &[Message]) -> Option<String> {
    for m in messages.iter().rev() {
        if let Some(t) = user_message_text(m) {
            return Some(t);
        }
    }
    None
}
