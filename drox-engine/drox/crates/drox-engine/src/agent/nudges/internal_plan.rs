//! L2 internal plan — soft nudges (not blocking gates).

/// Stale workbook — no `internal_plan_write` since N other tool calls.
#[must_use]
pub fn stale_plan_nudge(tools_since_touch: u32) -> String {
    format!(
        "Your **internal work plan** (L2 engine notebook) has not been updated for \
         {tools_since_touch} tool calls. Call `internal_plan_write` to refresh statuses, \
         add discoveries, or revise steps — keep it aligned with what you learned."
    )
}

/// Before user-facing answer — remind to sync the notebook.
#[must_use]
pub fn pre_answering_plan_nudge(tools_since_touch: u32) -> String {
    if tools_since_touch > 0 {
        return format!(
            "Before `[phase: answering]`: update `internal_plan_write` if your L2 notebook \
             is stale ({tools_since_touch} tools since last touch). Mark completed steps, \
             note discoveries, then answer the user."
        );
    }
    "Before `[phase: answering]`: confirm your internal work plan (L2) reflects what you \
     actually did — call `internal_plan_write` with status updates if needed, then answer."
        .to_string()
}
