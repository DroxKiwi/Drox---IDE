use crate::run_spec::RoleId;

#[must_use]
pub(crate) fn should_drain_subagent_reports(
    role: RoleId,
    seen_answering_in_run: bool,
    run_fully_closable: bool,
) -> bool {
    !(role == RoleId::Architect && seen_answering_in_run && run_fully_closable)
}

#[cfg(test)]
mod tests {
    use super::should_drain_subagent_reports;
    use crate::run_spec::RoleId;

    #[test]
    fn keeps_reports_during_active_architect_cycle() {
        assert!(should_drain_subagent_reports(
            RoleId::Architect,
            false,
            false
        ));
        assert!(should_drain_subagent_reports(
            RoleId::Architect,
            true,
            false
        ));
    }

    #[test]
    fn pauses_reports_when_architect_is_closing() {
        assert!(!should_drain_subagent_reports(
            RoleId::Architect,
            true,
            true
        ));
        assert!(should_drain_subagent_reports(
            RoleId::Executor,
            true,
            true
        ));
    }
}
