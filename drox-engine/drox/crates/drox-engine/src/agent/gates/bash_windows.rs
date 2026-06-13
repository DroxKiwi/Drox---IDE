//! Pre-check `bash` commands that fail under Windows `cmd.exe` (B-MOTOR-02).

const HEREDOC_BLOCKED: &str = "Blocked: bash heredoc (`<<`) is not supported on Windows (cmd.exe). \
Use `file_write` / `file_edit` for file content, or an explicit `powershell -Command` with a here-string (`@'…'@`). \
Do not simulate file writes with bash at VERIFY — return to ACT for mutations.";

const HEAD_BLOCKED: &str = "Blocked: `head` is not available in Windows cmd.exe. \
Use `powershell -Command \"Get-Content path -TotalCount N\"`, `file_read` with line ranges, or a project script from `package.json`.";

const TAIL_BLOCKED: &str = "Blocked: `tail` is not available in Windows cmd.exe. \
Use `powershell -Command \"Get-Content path -Tail N\"`, `file_read` with line ranges, or a project script from `package.json`.";

const SELECT_OBJECT_BLOCKED: &str = "Blocked: `Select-Object` in a bash string runs under cmd.exe, not PowerShell. \
Use `powershell -Command \"Get-Content path | Select-Object -First N\"` or `file_read` with line ranges.";

const UNIX_PIPE_BLOCKED: &str = "Blocked: Unix-style pipes (`| head`, `| tail`, `| grep`) often fail under Windows cmd.exe. \
Use npm/pnpm scripts, `powershell -Command`, or `file_read` / `grep` tools instead.";

/// English reminder appended to VERIFY rail snapshots on Windows hosts.
pub(crate) const VERIFY_WINDOWS_SHELL_REMINDER: &str = "Windows shell: `bash` runs via cmd.exe — no heredoc (`<<`); \
prefer npm/pnpm scripts, `cargo check`, `lsp`, or PowerShell (`Get-Content` instead of `head`/`tail`).";

/// Returns a block message when `command` is known to fail under Windows cmd.
#[must_use]
pub(crate) fn bash_windows_precheck(command: &str) -> Option<&'static str> {
    #[cfg(not(windows))]
    {
        let _ = command;
        return None;
    }

    #[cfg(windows)]
    {
        if command.contains("<<") {
            return Some(HEREDOC_BLOCKED);
        }
        if mentions_command_token(command, "head") {
            return Some(HEAD_BLOCKED);
        }
        if mentions_command_token(command, "tail") {
            return Some(TAIL_BLOCKED);
        }
        if mentions_command_token(command, "select-object")
            || command.to_ascii_lowercase().contains("select-object")
        {
            return Some(SELECT_OBJECT_BLOCKED);
        }
        if unix_pipe_to_shell_utility(command) {
            return Some(UNIX_PIPE_BLOCKED);
        }
        None
    }
}

/// True when stderr/stdout suggests a cmd.exe syntax failure from Unix-only bash.
#[must_use]
pub(crate) fn looks_like_windows_shell_mismatch(stderr: &str) -> bool {
    #[cfg(not(windows))]
    {
        let _ = stderr;
        return false;
    }

    #[cfg(windows)]
    {
        let s = stderr.to_ascii_lowercase();
        s.contains("<<")
            || s.contains("was unexpected at this time")
            || s.contains("'head' is not recognized")
            || s.contains("'tail' is not recognized")
            || s.contains("head : the term")
            || s.contains("tail : the term")
            || s.contains("select-object")
            || s.contains("select object")
    }
}

/// Short follow-up hint after a failed verify bash on Windows.
#[must_use]
pub(crate) fn verify_bash_failure_hint(stderr: &str) -> Option<&'static str> {
    if !looks_like_windows_shell_mismatch(stderr) {
        return None;
    }
    if stderr.contains("<<") {
        return Some(HEREDOC_BLOCKED);
    }
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("select-object") || lower.contains("select object") {
        return Some(SELECT_OBJECT_BLOCKED);
    }
    if lower.contains("head") {
        return Some(HEAD_BLOCKED);
    }
    if lower.contains("tail") {
        return Some(TAIL_BLOCKED);
    }
    Some(VERIFY_WINDOWS_SHELL_REMINDER)
}

fn unix_pipe_to_shell_utility(command: &str) -> bool {
    let lower = command.to_ascii_lowercase();
    for segment in lower.split('|').skip(1) {
        let seg = segment.trim();
        if seg.starts_with("head")
            || seg.starts_with("tail")
            || seg.starts_with("grep")
            || seg.starts_with("select-object")
        {
            return true;
        }
    }
    false
}

fn mentions_command_token(command: &str, name: &str) -> bool {
    let lower = command.to_ascii_lowercase();
    let needle = name.to_ascii_lowercase();
    lower.match_indices(&needle).any(|(i, _)| {
        let before_ok = i == 0 || !lower.as_bytes()[i - 1].is_ascii_alphanumeric();
        let after = i + needle.len();
        let after_ok = after >= lower.len() || !lower.as_bytes()[after].is_ascii_alphanumeric();
        before_ok && after_ok
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heredoc_blocked_on_windows() {
        if cfg!(windows) {
            assert!(bash_windows_precheck("cat << 'EOF' > README.md").is_some());
        } else {
            assert!(bash_windows_precheck("cat << 'EOF'").is_none());
        }
    }

    #[test]
    fn head_tail_detection() {
        if cfg!(windows) {
            assert!(bash_windows_precheck("head -n 5 README.md").is_some());
            assert!(bash_windows_precheck("npm test && tail -f log").is_some());
            assert!(bash_windows_precheck("npm run lint").is_none());
        }
    }

    #[test]
    fn select_object_and_pipe_blocked_on_windows() {
        if cfg!(windows) {
            assert!(bash_windows_precheck("Get-Content log | Select-Object -First 20").is_some());
            assert!(bash_windows_precheck("type package.json | head -20").is_some());
        }
    }

    #[test]
    fn windows_mismatch_stderr() {
        if cfg!(windows) {
            assert!(looks_like_windows_shell_mismatch("<< was unexpected at this time."));
            assert!(looks_like_windows_shell_mismatch(
                "Select-Object : The term 'Select-Object' is not recognized"
            ));
        }
    }

    #[test]
    fn verify_hint_select_object() {
        if cfg!(windows) {
            let hint = verify_bash_failure_hint("Select-Object : not recognized");
            assert_eq!(hint, Some(SELECT_OBJECT_BLOCKED));
        }
    }
}
