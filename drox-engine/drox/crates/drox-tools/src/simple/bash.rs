//! Tool `bash` — exécute une commande shell sous le workspace.
//!
//! Schéma volontairement minimal et **cross-platform** : la chaîne `command`
//! est passée au shell par défaut de l'OS (`cmd /C` sur Windows, `sh -c`
//! ailleurs). Aucune analyse côté tool ; les règles de permission consomment
//! déjà `command` via `drox-bash` + `PermissionPolicy::evaluate`.
//!
//! En mode hybride (cf. sprint 2.2.1), un client peut déclarer `bash` dans
//! `executableTools` ; le moteur remplace alors `BashTool` par un
//! `RemoteTool` qui ré-émet la requête via `tool/exec`. Cette implémentation
//! locale reste utile pour le mode CLI hors VS Code.

use std::process::Stdio;
use std::time::Instant;

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::process::Command;
use tokio::time::{Duration, timeout};

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

/// Timeout par défaut si l'appelant n'en fournit pas (2 minutes).
const DEFAULT_TIMEOUT_MS: u64 = 120_000;
/// Borne haute (10 minutes) — au-delà, le tool refuse plutôt que de laisser
/// pendre un sous-processus pendant trop longtemps.
const MAX_TIMEOUT_MS: u64 = 600_000;
/// Taille max par flux (stdout / stderr) avant troncature.
const MAX_STREAM_BYTES: usize = 30 * 1024;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct BashInput {
    /// Commande shell à exécuter (passée à `sh -c` / `cmd /C`).
    pub command: String,
    /// Description courte pour le journal. Optionnelle.
    #[serde(default)]
    pub description: Option<String>,
    /// Timeout en millisecondes. Défaut 120 000, plafond 600 000.
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

pub struct BashTool;

#[async_trait]
impl Tool for BashTool {
    fn name(&self) -> &str {
        "bash"
    }

    fn description(&self) -> &str {
        "Run a shell command in the workspace (cmd /C on Windows, sh -c elsewhere). \
         Returns { command, exit_code, stdout, stderr, timed_out, duration_ms }."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(BashInput)).unwrap_or(Value::Null)
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: BashInput = serde_json::from_value(input)?;
        let command = args.command.trim();
        if command.is_empty() {
            return Err(ToolError::invalid_args("command must not be empty"));
        }

        if ctx.plan_mode {
            return Err(ToolError::plan_violation("bash"));
        }

        let timeout_ms = args
            .timeout_ms
            .map_or(DEFAULT_TIMEOUT_MS, |ms| ms.min(MAX_TIMEOUT_MS));

        let started = Instant::now();
        let mut cmd = build_shell_command(command);
        let cwd = ctx.effective_workspace();
        cmd.current_dir(cwd.as_std_path())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let child = cmd
            .spawn()
            .map_err(|e| ToolError::io(cwd.clone(), e))?;

        let output_fut = child.wait_with_output();
        let result = timeout(Duration::from_millis(timeout_ms), output_fut).await;
        let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

        match result {
            Ok(Ok(output)) => {
                let (stdout, stdout_trunc) = decode_truncated(&output.stdout);
                let (stderr, stderr_trunc) = decode_truncated(&output.stderr);
                Ok(json!({
                    "command": command,
                    "exit_code": output.status.code(),
                    "stdout": stdout,
                    "stderr": stderr,
                    "stdout_truncated": stdout_trunc,
                    "stderr_truncated": stderr_trunc,
                    "timed_out": false,
                    "duration_ms": duration_ms,
                    "description": args.description,
                }))
            }
            Ok(Err(e)) => Err(ToolError::io(cwd.clone(), e)),
            Err(_elapsed) => Ok(json!({
                "command": command,
                "exit_code": null,
                "stdout": "",
                "stderr": "",
                "stdout_truncated": false,
                "stderr_truncated": false,
                "timed_out": true,
                "duration_ms": duration_ms,
                "description": args.description,
            })),
        }
    }
}

/// Choisit le shell par défaut de l'OS et lui passe la commande.
fn build_shell_command(command: &str) -> Command {
    #[cfg(windows)]
    {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(command);
        c
    }
    #[cfg(not(windows))]
    {
        let mut c = Command::new("sh");
        c.arg("-c").arg(command);
        c
    }
}

/// Décode des bytes en UTF-8 lossy en bornant la taille. Renvoie aussi un
/// flag `truncated` pour signaler que la fin a été coupée.
fn decode_truncated(bytes: &[u8]) -> (String, bool) {
    if bytes.len() <= MAX_STREAM_BYTES {
        return (String::from_utf8_lossy(bytes).into_owned(), false);
    }
    let head = &bytes[..MAX_STREAM_BYTES];
    let mut out = String::from_utf8_lossy(head).into_owned();
    out.push_str("\n…[truncated]");
    (out, true)
}

#[cfg(test)]
mod tests {
    use camino::Utf8PathBuf;
    use serde_json::json;

    use super::*;
    use crate::registry::ToolRegistry;

    fn make_ctx() -> ToolContext {
        let tmp = tempfile::tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        // Le `tempdir` est volontairement leaké pour la durée du test (`forget`
        // n'est pas idiomatique ; ici on stocke juste le path et on laisse le
        // OS nettoyer son /tmp).
        std::mem::forget(tmp);
        ToolContext::new(root, true)
    }

    #[tokio::test]
    async fn empty_command_rejected() {
        let ctx = make_ctx();
        let reg = ToolRegistry::with_simple_tools();
        let err = reg
            .execute_named("bash", &ctx, json!({ "command": "   " }))
            .await
            .unwrap_err();
        assert!(matches!(err, ToolError::InvalidArgs(_)));
    }

    #[tokio::test]
    async fn plan_mode_blocks_bash() {
        let mut ctx = make_ctx();
        ctx.plan_mode = true;
        let reg = ToolRegistry::with_simple_tools();
        let err = reg
            .execute_named("bash", &ctx, json!({ "command": "echo hi" }))
            .await
            .unwrap_err();
        assert!(matches!(err, ToolError::PlanModeViolation(_)));
    }

    #[tokio::test]
    async fn echo_runs_and_returns_stdout() {
        let ctx = make_ctx();
        let reg = ToolRegistry::with_simple_tools();
        let v = reg
            .execute_named("bash", &ctx, json!({ "command": "echo hello-drox" }))
            .await
            .unwrap();
        assert_eq!(v["timed_out"], false);
        assert_eq!(v["exit_code"], 0);
        let stdout = v["stdout"].as_str().unwrap_or("");
        assert!(
            stdout.contains("hello-drox"),
            "stdout did not contain expected token: {stdout:?}"
        );
    }
}
