/// Suit si une réponse utilisateur a déjà été publiée (phase `answering` ou promotion UI).
#[derive(Default)]
pub(crate) struct FinalAnswerGuard {
    answered_once: bool,
}

impl FinalAnswerGuard {
    pub(crate) fn mark_user_facing_answer_seen(&mut self) {
        self.answered_once = true;
    }

    #[must_use]
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn user_facing_answer_seen(&self) -> bool {
        self.answered_once
    }
}

#[cfg(test)]
mod tests {
    use super::FinalAnswerGuard;

    #[test]
    fn marks_user_facing_answer_once() {
        let mut guard = FinalAnswerGuard::default();
        assert!(!guard.user_facing_answer_seen());
        guard.mark_user_facing_answer_seen();
        assert!(guard.user_facing_answer_seen());
    }
}
