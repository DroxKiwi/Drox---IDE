//! Marqueurs déclarés par le **modèle** — le moteur ne déduit pas l'intention depuis des listes de mots.
//!
//! Marqueurs déclarés par le modèle dans le texte assistant (hors rail solo 1.4).

/// Tâche plan sans `delegate_executor` (synthèse / résumé utilisateur).
pub const TASK_META_LINE: &str = "[task: meta]";

/// Début de la réponse utilisateur (run `ArchitectDiscussion`) — extraction moteur / UI.
pub const DISCUSSION_REPLY_LINE: &str = "[discussion: reply]";

/// Fin du run discussion — le moteur arrête le tour.
pub const DISCUSSION_DONE_LINE: &str = "[discussion: done]";

/// Ids de tâche reconnus comme meta sans marqueur dans le libellé.
const META_TASK_IDS: &[&str] = &["meta", "summary", "synthesis", "user_summary"];

/// Première ligne `[task: meta]` dans le contenu d'une todo.
#[must_use]
pub fn todo_declares_meta_task(content: &str) -> bool {
    content
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .is_some_and(|line| line.eq_ignore_ascii_case(TASK_META_LINE))
}

/// `task_id` explicite pour une ligne meta (convention prompt).
#[must_use]
pub fn is_meta_task_id(task_id: &str) -> bool {
    META_TASK_IDS
        .iter()
        .any(|id| task_id.trim().eq_ignore_ascii_case(id))
}

/// Tâche de synthèse : id réservé **ou** marqueur dans `content`.
#[must_use]
pub fn is_meta_synthesis_task(task_id: &str, todo_content: Option<&str>) -> bool {
    if is_meta_task_id(task_id) {
        return true;
    }
    todo_content.is_some_and(todo_declares_meta_task)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meta_task_marker_and_id() {
        assert!(todo_declares_meta_task("[task: meta]\nRédiger le résumé"));
        assert!(is_meta_task_id("summary"));
        assert!(is_meta_synthesis_task(
            "t9",
            Some("[task: meta]\nSynthèse")
        ));
        assert!(!is_meta_synthesis_task("t1", Some("Lire package.json")));
    }
}
