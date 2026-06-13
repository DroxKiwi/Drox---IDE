//! Run rail system nudges (English — engine contract).

/// Injected before stopping the run after repeated ACT failures (C6).
pub const ACT_FAILURE_STOP_PROMPT: &str = "\
Run rail: ACT station — the same file path failed twice.\n\
Stop this run. In `[phase: answering]`, tell the user what failed and concrete fix hints.\n\
Then `[phase: done]`. Do not retry the same edit in this run.";

/// Injected after many rewrites of the same path (B-TOOL-01).
pub const ACT_WRITE_SPIRAL_PROMPT: &str = "\
Run rail: ACT — you have rewritten the same path many times.\n\
The engine is not truncating your tool calls — invalid JSON or oversized payloads come from the model.\n\
Try a **shorter** file, split into `file_edit` chunks, or simplify the component before rewriting the whole file.";
