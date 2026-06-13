//! System prompt for the boot intent probe tour.

pub const RUN_INTENT_PROBE_SYSTEM: &str =
    include_str!("../prompts/system/blocks/intent/run_intent_probe.md");

pub const RUN_INTENT_PROBE_RETRY: &str = "Your previous reply was not valid JSON. \
Reply with one JSON object only, matching: \
{\"probe\":\"run_intent\",\"greeting_only\":<bool>,\"expects_workspace_mutation\":<bool>}";
