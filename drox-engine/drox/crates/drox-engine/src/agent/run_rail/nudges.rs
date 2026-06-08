//! Run rail system nudges (English — engine contract).

/// Injected before stopping the run after repeated ACT failures (C6).
pub const ACT_FAILURE_STOP_PROMPT: &str = "\
Run rail: ACT station — the same file path failed twice.\n\
Stop this run. In `[phase: answering]`, tell the user what failed and concrete fix hints.\n\
Then `[phase: done]`. Do not retry the same edit in this run.";
