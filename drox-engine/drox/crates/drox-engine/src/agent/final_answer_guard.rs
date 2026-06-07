use crate::run_spec::RoleId;

#[derive(Default)]
pub(crate) struct FinalAnswerGuard {
    answered_once: bool,
}

impl FinalAnswerGuard {
    pub(crate) fn mark_user_facing_answer_seen(&mut self) {
        self.answered_once = true;
    }

    #[must_use]
    pub(crate) fn should_auto_stop_architect(
        &self,
        role: RoleId,
        todos_pending: u64,
        todos_in_progress: u64,
        run_fully_closable: bool,
        running_subagent_jobs: usize,
    ) -> bool {
        if role == RoleId::ArchitectDiscussion {
            return self.answered_once && running_subagent_jobs == 0;
        }
        role == RoleId::Architect
            && self.answered_once
            && todos_pending == 0
            && todos_in_progress == 0
            && run_fully_closable
            && running_subagent_jobs == 0
    }
}

#[cfg(test)]
mod tests {
    use super::FinalAnswerGuard;
    use crate::run_spec::RoleId;

    #[test]
    fn auto_stop_only_after_answer_and_full_closure() {
        let mut guard = FinalAnswerGuard::default();
        assert!(!guard.should_auto_stop_architect(
            RoleId::Architect,
            0,
            0,
            true,
            0
        ));
        guard.mark_user_facing_answer_seen();
        assert!(guard.should_auto_stop_architect(
            RoleId::Architect,
            0,
            0,
            true,
            0
        ));
        assert!(!guard.should_auto_stop_architect(
            RoleId::Architect,
            1,
            0,
            true,
            0
        ));
        assert!(!guard.should_auto_stop_architect(
            RoleId::Architect,
            0,
            0,
            false,
            0
        ));
        assert!(!guard.should_auto_stop_architect(
            RoleId::Executor,
            0,
            0,
            true,
            0
        ));
    }
}
