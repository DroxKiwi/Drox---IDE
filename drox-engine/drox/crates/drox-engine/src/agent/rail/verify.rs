//! VERIFY outcome — pass/fail from `bash` / `lsp` at station VERIFY.

use serde_json::Value;

use super::policy;
use super::station::RunStation;
use super::state::RunRailState;

/// Result of verify tools while at station VERIFY.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerifyOutcome {
    Unknown,
    Pass,
    Fail(String),
}

impl VerifyOutcome {
    #[must_use]
    pub fn passed(&self) -> bool {
        matches!(self, Self::Pass)
    }

    #[must_use]
    pub fn failed(&self) -> bool {
        matches!(self, Self::Fail(_))
    }
}

impl Default for VerifyOutcome {
    fn default() -> Self {
        Self::Unknown
    }
}

/// After a successful mutation at ACT, clear a prior verify failure.
pub fn reset_on_mutation_success(state: &mut RunRailState, tool_name: &str) {
    if state.station == RunStation::Act && policy::is_mutation_tool(tool_name) {
        state.verify_outcome = VerifyOutcome::Unknown;
    }
}

/// Record verify tool output at VERIFY; regress to ACT on failure.
/// Returns `true` when VERIFY failed and station regressed to ACT.
#[must_use]
pub fn on_verify_tool_result(
    state: &mut RunRailState,
    tool_name: &str,
    output: &Value,
    is_error: bool,
) -> bool {
    if state.station != RunStation::Verify {
        return false;
    }
    if is_error {
        fail_verify(state, format!("{tool_name} error"));
        return true;
    }
    match tool_name {
        "bash" => {
            if bash_failed(output) {
                let detail = bash_failure_summary(output);
                fail_verify(state, detail);
                return true;
            }
            state.verify_outcome = VerifyOutcome::Pass;
        }
        "lsp" if output.get("op").and_then(|v| v.as_str()) == Some("diagnostics") => {
            if lsp_diagnostics_failed(output) {
                let detail = lsp_failure_summary(output);
                fail_verify(state, detail);
                return true;
            }
            state.verify_outcome = VerifyOutcome::Pass;
        }
        _ => return false,
    }
    false
}

fn fail_verify(state: &mut RunRailState, message: String) {
    state.verify_outcome = VerifyOutcome::Fail(message);
    state.station = RunStation::Act;
}

#[must_use]
fn bash_failed(output: &Value) -> bool {
    match output.get("exit_code") {
        Some(Value::Number(n)) => n.as_i64().is_some_and(|c| c != 0),
        Some(Value::Null) | None => output
            .get("timed_out")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        _ => true,
    }
}

#[must_use]
fn bash_failure_summary(output: &Value) -> String {
    let code = output
        .get("exit_code")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "?".into());
    let stderr = output
        .get("stderr")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let head: String = stderr.chars().take(240).collect();
    if head.is_empty() {
        format!("bash exit_code={code}")
    } else {
        format!("bash exit_code={code}: {head}")
    }
}

#[must_use]
fn lsp_diagnostics_failed(output: &Value) -> bool {
    output
        .get("results")
        .and_then(|v| v.as_array())
        .is_some_and(|items| {
            items.iter().any(|item| {
                item.get("severity")
                    .and_then(|s| s.as_str())
                    .is_some_and(|sev| sev.eq_ignore_ascii_case("error"))
            })
        })
}

#[must_use]
fn lsp_failure_summary(output: &Value) -> String {
    let errors = output
        .get("results")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter(|item| {
                    item.get("severity")
                        .and_then(|s| s.as_str())
                        .is_some_and(|sev| sev.eq_ignore_ascii_case("error"))
                })
                .take(3)
                .filter_map(|item| {
                    let path = item.get("path").and_then(|p| p.as_str()).unwrap_or("?");
                    let msg = item.get("message").and_then(|m| m.as_str()).unwrap_or("?");
                    Some(format!("{path}: {msg}"))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if errors.is_empty() {
        "lsp diagnostics reported errors".into()
    } else {
        errors.join("; ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn bash_nonzero_fails_verify() {
        assert!(bash_failed(&json!({ "exit_code": 2, "stderr": "TS2322" })));
        assert!(!bash_failed(&json!({ "exit_code": 0 })));
    }

    #[test]
    fn lsp_errors_fail_verify() {
        let out = json!({
            "op": "diagnostics",
            "results": [
                { "severity": "error", "path": "a.tsx", "message": "bad type" }
            ]
        });
        assert!(lsp_diagnostics_failed(&out));
    }

    #[test]
    fn verify_fail_regresses_to_act() {
        let mut state = RunRailState {
            station: RunStation::Verify,
            ..RunRailState::new()
        };
        let _ = on_verify_tool_result(&mut state, "bash", &json!({ "exit_code": 1 }), false);
        assert_eq!(state.station, RunStation::Act);
        assert!(state.verify_outcome.failed());
    }

    #[test]
    fn mutation_clears_verify_outcome() {
        let mut state = RunRailState {
            station: RunStation::Act,
            verify_outcome: VerifyOutcome::Fail("x".into()),
            ..RunRailState::new()
        };
        reset_on_mutation_success(&mut state, "file_write");
        assert_eq!(state.verify_outcome, VerifyOutcome::Unknown);
    }
}
