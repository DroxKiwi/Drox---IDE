//! Tool `bash` — exécute une commande shell sous le workspace.

use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, Notify};
use tokio::time::timeout;

use camino::Utf8Path;

use crate::tool_context::ToolContext;
use crate::error::ToolError;
use crate::media::{bytes_look_binary, media_type_for_path};
use crate::tool_progress::ShellProgressUpdate;
use crate::tool::Tool;

/// Cursor-like default when the model omits `timeout_ms`.
const DEFAULT_TIMEOUT_MS: u64 = 60_000;
const MAX_STREAM_BYTES: usize = 30 * 1024;
const PROGRESS_INTERVAL_MS: u64 = 150;
const TAIL_LINES: usize = 5;

/// Active native (in-process) bash child — Skip / `tools.skipBash` kills it.
static ACTIVE_NATIVE_BASH: Mutex<Option<u32>> = Mutex::const_new(None);
static NATIVE_BASH_SKIP_REQUESTED: AtomicBool = AtomicBool::new(false);
static NATIVE_BASH_SKIP_NOTIFY: Notify = Notify::const_new();

const USER_STOPPED: &str = "The user stopped this command. Resume the current task without running this command again.";

/// Arm a one-shot user stop and kill the in-flight native child if any.
/// Returns true when a pid was targeted. The flag stays set when nothing is
/// running yet, so the next `bash` does not start.
pub async fn skip_active_native_bash() -> bool {
    NATIVE_BASH_SKIP_REQUESTED.store(true, Ordering::SeqCst);
    NATIVE_BASH_SKIP_NOTIFY.notify_waiters();
    let pid = {
        let guard = ACTIVE_NATIVE_BASH.lock().await;
        *guard
    };
    let Some(pid) = pid else {
        return false;
    };
    let _ = tokio::task::spawn_blocking(move || kill_pid(pid)).await;
    true
}

/// Consume the user-stop flag. The next `bash` (or the one about to start) must not run.
pub fn take_bash_user_stop() -> bool {
    NATIVE_BASH_SKIP_REQUESTED.swap(false, Ordering::SeqCst)
}

/// Drop a stop that was already applied (in-flight client command or permission ask).
pub fn clear_bash_user_stop() {
    NATIVE_BASH_SKIP_REQUESTED.store(false, Ordering::SeqCst);
}

pub fn bash_user_stopped_output(command: &str) -> Value {
    json!({
        "command": command,
        "exit_code": null,
        "stdout": "",
        "stderr": "",
        "timed_out": false,
        "skipped": true,
        "error": USER_STOPPED,
    })
}

fn kill_pid(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct BashInput {
    pub command: String,
    #[serde(default)]
    pub description: Option<String>,
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
        drox_prompts::BASH_TOOL_DESCRIPTION
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(BashInput)).unwrap_or(Value::Null)
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: BashInput = serde_json::from_value(input)?;
        let raw = args.command.trim();
        if raw.is_empty() {
            return Err(ToolError::invalid_args("command must not be empty"));
        }
        #[cfg(windows)]
        let command = normalize_windows_cmd(raw);
        #[cfg(not(windows))]
        let command = raw.to_string();

        if ctx.plan_mode {
            return Err(ToolError::plan_violation("bash"));
        }

        let timeout_ms = args
            .timeout_ms
            .filter(|ms| *ms > 0)
            .unwrap_or(DEFAULT_TIMEOUT_MS);

        if take_bash_user_stop() {
            return Ok(bash_user_stopped_output(&command));
        }

        let started = Instant::now();
        let cwd = ctx.effective_workspace();
        let mut cmd = build_shell_command(&command);
        cmd.current_dir(cwd.as_std_path())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd
            .spawn()
            .map_err(|e| ToolError::io(cwd.clone(), e))?;

        if let Some(pid) = child.id() {
            *ACTIVE_NATIVE_BASH.lock().await = Some(pid);
        }

        let buffers = Arc::new(Mutex::new(StreamBuffers::default()));
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let mut tasks = Vec::new();
        if let Some(out) = stdout {
            let bufs = Arc::clone(&buffers);
            let ctx_pipe = ctx.clone();
            tasks.push(tokio::spawn(async move {
                read_pipe(out, StreamKind::Stdout, bufs, ctx_pipe, started).await;
            }));
        }
        if let Some(err) = stderr {
            let bufs = Arc::clone(&buffers);
            let ctx_pipe = ctx.clone();
            tasks.push(tokio::spawn(async move {
                read_pipe(err, StreamKind::Stderr, bufs, ctx_pipe, started).await;
            }));
        }

        let wait_result = timeout(
            Duration::from_millis(timeout_ms),
            wait_child(&mut child, tasks),
        )
        .await;

        *ACTIVE_NATIVE_BASH.lock().await = None;
        let skipped = NATIVE_BASH_SKIP_REQUESTED.swap(false, Ordering::SeqCst);

        let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        let bufs = buffers.lock().await.clone();

        if skipped {
            report_shell_progress(ctx, &bufs.combined_display(), started);
            let mut value = stream_result(&command, &cwd, &bufs);
            value["exit_code"] = Value::Null;
            value["timed_out"] = json!(false);
            value["duration_ms"] = json!(duration_ms);
            value["description"] = json!(args.description);
            value["skipped"] = json!(true);
            value["error"] = json!(USER_STOPPED);
            return Ok(value);
        }

        match wait_result {
            Ok(Ok(status)) => {
                report_shell_progress(ctx, &bufs.combined_display(), started);
                let mut value = stream_result(&command, &cwd, &bufs);
                value["exit_code"] = json!(status.code());
                value["timed_out"] = json!(false);
                value["duration_ms"] = json!(duration_ms);
                value["description"] = json!(args.description);
                Ok(value)
            }
            Ok(Err(e)) => Err(ToolError::io(cwd.clone(), e)),
            Err(_elapsed) => {
                let _ = child.kill().await;
                report_shell_progress(ctx, &bufs.combined_display(), started);
                Ok(json!({
                    "command": command,
                    "exit_code": null,
                    "stdout": "",
                    "stderr": "",
                    "stdout_truncated": false,
                    "stderr_truncated": false,
                    "timed_out": true,
                    "duration_ms": duration_ms,
                    "description": args.description,
                }))
            }
        }
    }
}

#[derive(Debug, Clone, Default)]
struct StreamHalf {
    text: String,
    bytes: usize,
    sample: Vec<u8>,
    binary: bool,
}

impl StreamHalf {
    fn push(&mut self, chunk: &[u8]) {
        self.bytes += chunk.len();
        if self.sample.len() < 8 * 1024 {
            let room = (8 * 1024) - self.sample.len();
            let n = chunk.len().min(room);
            self.sample.extend_from_slice(&chunk[..n]);
        }
        if !self.binary && bytes_look_binary(&self.sample) {
            self.binary = true;
            self.text.clear();
        }
        if self.binary || self.text.len() >= MAX_STREAM_BYTES {
            return;
        }
        self.text.push_str(&String::from_utf8_lossy(chunk));
    }

    fn display(&self) -> String {
        if self.binary {
            format!("Binary output ({} bytes)", self.bytes)
        } else {
            self.text.clone()
        }
    }
}

#[derive(Debug, Clone, Default)]
struct StreamBuffers {
    stdout: StreamHalf,
    stderr: StreamHalf,
}

impl StreamBuffers {
    fn combined_display(&self) -> String {
        let mut out = self.stdout.display();
        let err = self.stderr.display();
        if !err.is_empty() {
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(&err);
        }
        out
    }
}

struct MediaHit {
    name: String,
    path: String,
    size_bytes: u64,
    media_type: &'static str,
}

fn media_target_from_command(command: &str, cwd: &Utf8Path) -> Option<MediaHit> {
    for raw in command.split_whitespace() {
        let token = raw.trim_matches(|c: char| "\"'`,".contains(c));
        let Some(media_type) = media_type_for_path(token) else {
            continue;
        };
        let candidate = if std::path::Path::new(token).is_absolute() {
            camino::Utf8PathBuf::from(token)
        } else {
            cwd.join(token)
        };
        let Ok(meta) = std::fs::metadata(candidate.as_std_path()) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        return Some(MediaHit {
            name: candidate.file_name().unwrap_or(token).to_string(),
            path: candidate.to_string(),
            size_bytes: meta.len(),
            media_type,
        });
    }
    None
}

fn binary_note(bytes: usize, hit: Option<&MediaHit>) -> String {
    let mut note = format!("Binary output, {bytes} bytes. Body not inlined.");
    if let Some(hit) = hit {
        note.push_str(&format!(
            "\nname: {}\npath: {}\nsize_bytes: {}\nmedia_type: {}",
            hit.name, hit.path, hit.size_bytes, hit.media_type
        ));
    }
    note
}

fn stream_result(command: &str, cwd: &Utf8Path, bufs: &StreamBuffers) -> Value {
    let hit = if bufs.stdout.binary || bufs.stderr.binary {
        media_target_from_command(command, cwd)
    } else {
        None
    };
    let (stdout, stdout_trunc) = if bufs.stdout.binary {
        (binary_note(bufs.stdout.bytes, hit.as_ref()), false)
    } else {
        decode_truncated(bufs.stdout.text.as_bytes())
    };
    let (stderr, stderr_trunc) = if bufs.stderr.binary {
        (binary_note(bufs.stderr.bytes, hit.as_ref()), false)
    } else {
        decode_truncated(bufs.stderr.text.as_bytes())
    };
    let mut value = json!({
        "command": command,
        "stdout": stdout,
        "stderr": stderr,
        "stdout_truncated": stdout_trunc,
        "stderr_truncated": stderr_trunc,
    });
    if bufs.stdout.binary || bufs.stderr.binary {
        value["output_binary"] = json!(true);
        value["output_bytes"] = json!(bufs.stdout.bytes.saturating_add(bufs.stderr.bytes));
        if let Some(hit) = hit {
            value["name"] = json!(hit.name);
            value["path"] = json!(hit.path);
            value["size_bytes"] = json!(hit.size_bytes);
            value["media_type"] = json!(hit.media_type);
        }
    }
    value
}

#[derive(Clone, Copy)]
enum StreamKind {
    Stdout,
    Stderr,
}

async fn wait_child(
    child: &mut Child,
    pump_tasks: Vec<tokio::task::JoinHandle<()>>,
) -> std::io::Result<std::process::ExitStatus> {
    let user_stopped = {
        let notified = NATIVE_BASH_SKIP_NOTIFY.notified();
        tokio::pin!(notified);
        let status = child.wait();
        tokio::pin!(status);
        loop {
            tokio::select! {
                biased;
                result = &mut status => {
                    for t in pump_tasks {
                        let _ = t.await;
                    }
                    return result;
                }
                _ = &mut notified => break true,
                _ = tokio::time::sleep(Duration::from_millis(150)) => {
                    // `notify_waiters` is lost if it fires before this wait is polled.
                    // The flag stays set, so a click still ends the command.
                    if NATIVE_BASH_SKIP_REQUESTED.load(Ordering::SeqCst) {
                        break true;
                    }
                }
            }
        }
    };
    if user_stopped {
        force_stop_child(child, &pump_tasks).await
    } else {
        unreachable!()
    }
}

async fn force_stop_child(
    child: &mut Child,
    pump_tasks: &[tokio::task::JoinHandle<()>],
) -> std::io::Result<std::process::ExitStatus> {
    let _ = child.start_kill();
    if let Some(pid) = child.id() {
        let _ = tokio::task::spawn_blocking(move || kill_pid(pid)).await;
    }
    for t in pump_tasks {
        t.abort();
    }
    let _ = timeout(Duration::from_millis(500), child.wait()).await;
    Ok(forced_stop_status())
}

fn forced_stop_status() -> std::process::ExitStatus {
    #[cfg(windows)]
    {
        use std::os::windows::process::ExitStatusExt;
        std::process::ExitStatus::from_raw(1)
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::process::ExitStatusExt;
        std::process::ExitStatus::from_raw(9)
    }
}

async fn read_pipe<R>(
    mut reader: R,
    kind: StreamKind,
    buffers: Arc<Mutex<StreamBuffers>>,
    ctx: ToolContext,
    started: Instant,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut chunk = [0u8; 4096];
    let mut last_report = Instant::now();
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) => break,
            Ok(n) => {
                {
                    let mut b = buffers.lock().await;
                    match kind {
                        StreamKind::Stdout => b.stdout.push(&chunk[..n]),
                        StreamKind::Stderr => b.stderr.push(&chunk[..n]),
                    }
                }
                if last_report.elapsed() >= Duration::from_millis(PROGRESS_INTERVAL_MS) {
                    let snapshot = buffers.lock().await.clone();
                    report_shell_progress(&ctx, &snapshot.combined_display(), started);
                    last_report = Instant::now();
                }
            }
            Err(_) => break,
        }
    }
    let snapshot = buffers.lock().await.clone();
    report_shell_progress(&ctx, &snapshot.combined_display(), started);
}

fn report_shell_progress(ctx: &ToolContext, full: &str, started: Instant) {
    let Some(sink) = ctx.tool_progress.as_ref() else {
        return;
    };
    let lines: Vec<&str> = full.lines().collect();
    let tail: String = lines
        .iter()
        .rev()
        .take(TAIL_LINES)
        .copied()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    let elapsed_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    sink.report_shell(ShellProgressUpdate {
        output: tail,
        full_output: full.to_string(),
        elapsed_ms,
        total_lines: lines.len(),
    });
}

fn build_shell_command(command: &str) -> Command {
    #[cfg(windows)]
    {
        // `arg()` re-quote via CreateProcess and breaks `dir "C:\path"`.
        // `/S /C "command"` : cmd strips the outer quotes and runs the rest as-is.
        let mut c = Command::new("cmd");
        c.raw_arg("/S").raw_arg("/C").raw_arg(format!("\"{command}\""));
        c
    }
    #[cfg(not(windows))]
    {
        let mut c = Command::new("sh");
        c.arg("-c").arg(command);
        c
    }
}

/// Réécrit une commande modèle pour `cmd.exe` : `ls` → `dir`, `;` → `&`,
/// `pwd` → `cd`, et déplie un `cmd /c` imbriqué.
pub(crate) fn normalize_windows_cmd(command: &str) -> String {
    let mut s = command.trim().to_string();
    if let Some(inner) = peel_nested_cmd_c(&s) {
        s = inner;
    }
    s = replace_semicolons_outside_quotes(&s);
    rewrite_unix_tokens(&s)
}

fn peel_nested_cmd_c(command: &str) -> Option<String> {
    let t = command.trim();
    let lower = t.to_ascii_lowercase();
    let prefix = if lower.starts_with("cmd.exe") {
        7
    } else if lower.starts_with("cmd") {
        3
    } else {
        return None;
    };
    let mut rest = t[prefix..].trim_start();
    let mut saw_c = false;
    loop {
        let r = rest.trim_start();
        let rl = r.to_ascii_lowercase();
        if rl.starts_with("/s") {
            rest = r.get(2..)?.trim_start();
            continue;
        }
        if rl.starts_with("/c") {
            saw_c = true;
            rest = r.get(2..)?.trim_start();
            continue;
        }
        break;
    }
    if !saw_c {
        return None;
    }
    let inner = strip_wrapping_quotes(rest);
    if inner.is_empty() {
        None
    } else {
        Some(inner.to_string())
    }
}

fn strip_wrapping_quotes(s: &str) -> &str {
    let t = s.trim();
    if t.len() >= 2
        && ((t.starts_with('"') && t.ends_with('"')) || (t.starts_with('\'') && t.ends_with('\'')))
    {
        &t[1..t.len() - 1]
    } else {
        t
    }
}

fn replace_semicolons_outside_quotes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_s = false;
    let mut in_d = false;
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        match ch {
            '\'' if !in_d => in_s = !in_s,
            '"' if !in_s => in_d = !in_d,
            ';' if !in_s && !in_d => {
                let rest = chars[i + 1..].iter().skip_while(|c| c.is_whitespace());
                let next = rest.clone().next();
                if next.is_some_and(|c| c.is_ascii_alphabetic() || *c == '.') {
                    out.push('&');
                    i += 1;
                    continue;
                }
            }
            _ => {}
        }
        out.push(ch);
        i += 1;
    }
    out
}

fn rewrite_unix_tokens(s: &str) -> String {
    split_keep_seps(s, &['&', '|'])
        .into_iter()
        .map(|(piece, sep)| {
            let rewritten = rewrite_leading_unix(&piece);
            match sep {
                Some(c) => format!("{rewritten}{c}"),
                None => rewritten,
            }
        })
        .collect()
}

fn rewrite_leading_unix(piece: &str) -> String {
    let lead = piece.len() - piece.trim_start().len();
    let body = &piece[lead..];
    let prefix = &piece[..lead];
    if let Some(out) = rewrite_cmd_name(body, "ls", "dir") {
        return format!("{prefix}{out}");
    }
    if let Some(out) = rewrite_cmd_name(body, "pwd", "cd") {
        return format!("{prefix}{out}");
    }
    piece.to_string()
}

fn rewrite_cmd_name(body: &str, from: &str, to: &str) -> Option<String> {
    if body == from {
        return Some(to.to_string());
    }
    let rest = body.strip_prefix(from)?;
    if rest.starts_with(|c: char| c.is_whitespace()) {
        Some(format!("{to}{rest}"))
    } else {
        None
    }
}

fn split_keep_seps(s: &str, seps: &[char]) -> Vec<(String, Option<char>)> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_s = false;
    let mut in_d = false;
    for ch in s.chars() {
        match ch {
            '\'' if !in_d => {
                in_s = !in_s;
                cur.push(ch);
            }
            '"' if !in_s => {
                in_d = !in_d;
                cur.push(ch);
            }
            c if !in_s && !in_d && seps.contains(&c) => {
                out.push((std::mem::take(&mut cur), Some(c)));
            }
            _ => cur.push(ch),
        }
    }
    out.push((cur, None));
    out
}

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
    use std::time::Duration;

    use camino::Utf8PathBuf;
    use serde_json::json;

    use super::*;
    use crate::registry::ToolRegistry;

    fn make_ctx() -> ToolContext {
        let tmp = tempfile::tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
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
    async fn user_stop_ends_a_long_command() {
        let ctx = make_ctx();
        let reg = ToolRegistry::with_simple_tools();
        let started = std::time::Instant::now();
        let run = tokio::spawn(async move {
            reg.execute_named(
                "bash",
                &ctx,
                json!({ "command": "ping -n 20 127.0.0.1", "timeout_ms": 30000 }),
            )
            .await
        });
        tokio::time::sleep(Duration::from_millis(400)).await;
        assert!(skip_active_native_bash().await);
        let v = run.await.unwrap().unwrap();
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "stop took {:?}",
            started.elapsed()
        );
        assert_eq!(v["skipped"], true);
        assert!(v["error"].as_str().unwrap_or("").contains("The user stopped this command"));
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

    #[test]
    fn normalize_rewrites_ls_semicolon_and_nested_cmd() {
        assert_eq!(
            normalize_windows_cmd(r#"ls "C:\Users\coren\proj""#),
            r#"dir "C:\Users\coren\proj""#
        );
        assert_eq!(
            normalize_windows_cmd("git status --short; echo hi"),
            "git status --short& echo hi"
        );
        assert_eq!(
            normalize_windows_cmd(r#"cmd /c "dir C:\tmp""#),
            r#"dir C:\tmp"#
        );
        assert_eq!(normalize_windows_cmd("pwd"), "cd");
        assert_eq!(
            normalize_windows_cmd(r#"echo "a;b"; echo c"#),
            r#"echo "a;b"& echo c"#
        );
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn quoted_windows_path_dir_succeeds() {
        let ctx = make_ctx();
        let path = ctx.workspace_root.as_str();
        let reg = ToolRegistry::with_simple_tools();
        let v = reg
            .execute_named(
                "bash",
                &ctx,
                json!({ "command": format!("dir \"{path}\"") }),
            )
            .await
            .unwrap();
        assert_eq!(v["exit_code"], 0, "stderr={}", v["stderr"]);
    }

    #[tokio::test]
    async fn binary_output_is_a_fiche() {
        let ctx = make_ctx();
        let gif = ctx.workspace_root.join("clip.gif");
        let body = b"GIF89a\0\0\0\0binary-body-should-not-appear";
        std::fs::write(gif.as_std_path(), body).unwrap();
        let reg = ToolRegistry::with_simple_tools();
        #[cfg(windows)]
        let command = "type clip.gif";
        #[cfg(not(windows))]
        let command = "cat clip.gif";
        let v = reg
            .execute_named("bash", &ctx, json!({ "command": command }))
            .await
            .unwrap();
        assert_eq!(v["output_binary"], true, "{v}");
        assert_eq!(v["name"], "clip.gif");
        assert_eq!(v["media_type"], "image/gif");
        assert_eq!(v["size_bytes"], body.len() as u64);
        let stdout = v["stdout"].as_str().unwrap_or("");
        assert!(stdout.contains("Body not inlined"), "{stdout}");
        assert!(!stdout.contains("binary-body-should-not-appear"), "{stdout}");
    }
}
