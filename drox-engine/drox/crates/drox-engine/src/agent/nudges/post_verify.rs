//! Nudge when verify `bash` fails at station VERIFY.

pub(crate) const VERIFY_BASH_RETRY_NUDGE_PROMPT: &str = "\
Run rail: VERIFY — your `bash` command failed or was blocked.\n\
Retry with a project-defined script (no Unix-only pipes like `| head`). Use `lsp` diagnostics on edited files, or read manifests for the correct command.";
