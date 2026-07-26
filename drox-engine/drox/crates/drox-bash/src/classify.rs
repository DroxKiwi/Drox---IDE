//! Classification heuristique d’une sous-commande Bash (premier mot exécutable).

use std::sync::LazyLock;

use regex::Regex;

/// Catégorie grossière pour l’UI / logs (pas encore branchée sur deny automatique).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum BashCommandKind {
    /// Lecture ou introspection (`ls`, `cat`, `git status`, …).
    ReadOnly,
    /// Modification locale probable (`touch`, `chmod`, `npm install`, …).
    Mutating,
    /// Accès réseau (`curl`, `wget`, `ssh`, …).
    Network,
    /// Opération à risque élevé (`rm -rf`, `dd`, …) — voir aussi [`destructive_hint`].
    Destructive,
    /// Non classé.
    Unknown,
}

static ENV_ASSIGN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z_][A-Za-z0-9_]*=").expect("valid regex"));

/// Retire les préfixes `VAR=value` « sûrs » en tête (même heuristique minimale que le TS).
#[must_use]
pub fn first_executable_token(segment: &str) -> Option<&str> {
    let mut rest = segment.trim();
    while let Some(tok) = rest.split_whitespace().next() {
        if ENV_ASSIGN.is_match(tok) {
            rest = rest[tok.len()..].trim_start();
            continue;
        }
        return Some(tok);
    }
    None
}

/// Classe une sous-commande à partir de son premier token.
#[must_use]
pub fn kind_of_segment(segment: &str) -> BashCommandKind {
    let Some(first) = first_executable_token(segment) else {
        return BashCommandKind::Unknown;
    };
    let base = first
        .rsplit_once('/')
        .map_or(first, |(_, name)| name)
        .to_ascii_lowercase();

    if READ_ONLY.contains(&base.as_str()) {
        return BashCommandKind::ReadOnly;
    }
    if NETWORK.contains(&base.as_str()) {
        return BashCommandKind::Network;
    }
    if DESTRUCTIVE_PREFIX.contains(&base.as_str()) {
        return BashCommandKind::Destructive;
    }

    // Package / build tools: verification subcommands are inspect-only.
    if matches!(base.as_str(), "cargo" | "npm" | "pnpm" | "yarn" | "tsc" | "npx" | "gh") {
        return classify_toolchain(base.as_str(), segment);
    }

    // Stream filters: ReadOnly unless in-place / file-write flags (see `classify_stream_filter`).
    if matches!(base.as_str(), "sed" | "awk") {
        return classify_stream_filter(base.as_str(), segment);
    }

    if MUTATING.contains(&base.as_str()) {
        return BashCommandKind::Mutating;
    }

    if base == "git" {
        return classify_git(segment);
    }

    BashCommandKind::Unknown
}

/// `sed` / `awk` used as text filters (pipelines) are inspect-only; `-i` / inplace → Mutating.
fn classify_stream_filter(base: &str, segment: &str) -> BashCommandKind {
    let lower = segment.to_ascii_lowercase();
    let tokens: Vec<&str> = lower.split_whitespace().collect();
    match base {
        "sed" => {
            // `sed -i`, `sed -i.bak`, `sed --in-place`
            if tokens
                .iter()
                .any(|t| *t == "--in-place" || *t == "-i" || t.starts_with("-i"))
            {
                BashCommandKind::Mutating
            } else {
                BashCommandKind::ReadOnly
            }
        }
        "awk" => {
            // gawk in-place extension: `-i inplace` (bare `-i` is @include — keep ReadOnly)
            if tokens
                .windows(2)
                .any(|w| w[0] == "-i" && w[1].contains("inplace"))
                || lower.contains("-i inplace")
            {
                BashCommandKind::Mutating
            } else {
                BashCommandKind::ReadOnly
            }
        }
        _ => BashCommandKind::Mutating,
    }
}

fn classify_toolchain(base: &str, segment: &str) -> BashCommandKind {
    let lower = segment.to_ascii_lowercase();
    let tokens: Vec<&str> = lower.split_whitespace().collect();
    // Skip leading ENV=value already handled by first_executable_token; re-find base index.
    let Some(idx) = tokens.iter().position(|t| {
        let name = t.rsplit_once('/').map_or(*t, |(_, n)| n);
        name == base
    }) else {
        return BashCommandKind::Mutating;
    };
    match base {
        "cargo" => {
            let sub = tokens.get(idx + 1).copied().unwrap_or("");
            if matches!(
                sub,
                "check" | "test" | "clippy" | "tree" | "metadata" | "version" | "-v" | "-V" | "--version"
            ) || (sub == "fmt" && tokens.iter().any(|t| *t == "--check"))
            {
                BashCommandKind::ReadOnly
            } else {
                BashCommandKind::Mutating
            }
        }
        "npm" | "pnpm" | "yarn" => {
            let sub = tokens.get(idx + 1).copied().unwrap_or("");
            if matches!(sub, "test" | "version" | "-v" | "--version")
                || (sub == "run"
                    && matches!(
                        tokens.get(idx + 2).copied().unwrap_or(""),
                        "test" | "typecheck" | "lint" | "check"
                    ))
            {
                BashCommandKind::ReadOnly
            } else {
                BashCommandKind::Mutating
            }
        }
        "tsc" => BashCommandKind::ReadOnly,
        "npx" => {
            if tokens.get(idx + 1).copied() == Some("tsc") {
                BashCommandKind::ReadOnly
            } else {
                BashCommandKind::Mutating
            }
        }
        "gh" => {
            let rest = tokens.get(idx + 1..).unwrap_or(&[]).join(" ");
            if rest.starts_with("auth status")
                || rest.starts_with("--version")
                || rest.starts_with("pr view")
                || rest.starts_with("pr list")
                || rest.starts_with("pr status")
                || rest.starts_with("repo view")
                || rest == "version"
                || tokens.get(idx + 1) == Some(&"--version")
            {
                BashCommandKind::ReadOnly
            } else {
                BashCommandKind::Mutating
            }
        }
        _ => BashCommandKind::Mutating,
    }
}

fn classify_git(segment: &str) -> BashCommandKind {
    // Skip leading ENV=value so `FOO=1 git status` still resolves.
    let mut it = segment.split_whitespace().filter(|t| !ENV_ASSIGN.is_match(t));
    let _git = it.next();
    let Some(sub) = it.next() else {
        return BashCommandKind::ReadOnly;
    };
    let sub = sub.to_ascii_lowercase();
    if sub == "config" {
        // Bare `git config` / `git config user.email x` writes; inspect flags only are read.
        let lower = segment.to_ascii_lowercase();
        if ["--get", "--list", "-l", "--get-regexp", "--get-all", "--get-urlmatch"]
            .iter()
            .any(|f| lower.split_whitespace().any(|t| t == *f))
        {
            return BashCommandKind::ReadOnly;
        }
        return BashCommandKind::Mutating;
    }
    if GIT_READ.contains(&sub.as_str()) {
        BashCommandKind::ReadOnly
    } else if GIT_MUTATING.contains(&sub.as_str()) {
        BashCommandKind::Mutating
    } else {
        BashCommandKind::Unknown
    }
}

/// `true` if every subcommand is [`BashCommandKind::ReadOnly`] (agent todo / phase gates).
///
/// File redirects (`>` / `>>`, except stderr-only to nul) force **false**.
#[must_use]
pub fn command_is_inspect_only(command: &str) -> bool {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return true;
    }
    if has_file_redirect(trimmed) {
        return false;
    }
    let segments = match crate::split::split_command_segments(trimmed) {
        Ok(s) if !s.is_empty() => s,
        Ok(_) => return true,
        Err(_) => vec![trimmed.to_string()],
    };
    segments
        .iter()
        .all(|seg| {
            // Pure `FOO=1` leftovers from the splitter are not commands.
            if first_executable_token(seg).is_none() {
                return true;
            }
            kind_of_segment(seg) == BashCommandKind::ReadOnly
        })
}

/// `true` when the command likely writes via shell redirect (not `2>nul` / `>/dev/null` only).
///
/// Fd-to-fd merges (`2>&1`, `1>&2`, `>&1`) are **not** file writes — they must not trip agent
/// inspect-only gates (smoke: `ls … 2>&1` was falsely blocked as mutating bash).
#[must_use]
pub fn has_file_redirect(command: &str) -> bool {
    let bytes = command.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'>' {
            // `>>` append — skip the second `>` then inspect target.
            let rest = command[i + 1..].trim_start_matches('>').trim_start();
            // `N>&M` / `>&M` — duplicate fd, not a path.
            if rest.starts_with('&') {
                let after_amp = rest[1..].trim_start();
                if after_amp
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_digit())
                {
                    i += 1;
                    continue;
                }
            }
            // `2>nul`, `>/dev/null`, `>nul` — discard only, not a workspace write.
            let to_nul = rest.to_ascii_lowercase().starts_with("nul")
                || rest.starts_with("/dev/null")
                || rest.starts_with("NUL");
            if to_nul {
                i += 1;
                continue;
            }
            return true;
        }
        i += 1;
    }
    false
}

/// Motifs destructifs (sous-ensemble porté depuis `destructiveCommandWarning.ts`).
#[must_use]
pub fn destructive_hint(segment: &str) -> Option<&'static str> {
    let s = segment;
    for (re, msg) in DESTRUCTIVE_PATTERNS.iter() {
        if re.is_match(s) {
            return Some(*msg);
        }
    }
    None
}

/// Drapeaux permissions pour une sous-commande (utilisés par `drox-engine`).
#[must_use]
pub const fn permission_flags(kind: BashCommandKind) -> (bool, bool) {
    match kind {
        BashCommandKind::ReadOnly => (false, true),
        BashCommandKind::Mutating | BashCommandKind::Network | BashCommandKind::Destructive => {
            (true, false)
        }
        BashCommandKind::Unknown => (true, false),
    }
}

/// Message de refus automatique pour motifs à haut risque (§2.27).
///
/// Distinct de [`destructive_hint`] informatif : ici on **bloque** en mode défaut
/// si la politique ne contient pas déjà une règle `Allow` explicite.
#[must_use]
pub fn auto_deny_message(segment: &str) -> Option<&'static str> {
    destructive_hint(segment).or_else(|| {
        let kind = kind_of_segment(segment);
        if kind == BashCommandKind::Destructive {
            Some("destructive command (rm/dd/mkfs/shred or similar)")
        } else {
            None
        }
    })
}

static READ_ONLY: &[&str] = &[
    "ls", "dir", "pwd", "cd", "echo", "printf", "cat", "tac", "head", "tail", "wc", "sort", "uniq",
    "less", "more", "file", "stat", "whoami", "id", "uname", "date", "true", "false", "test", "[",
    "which", "where", "whereis", "type", "command", "help", "man", "basename", "dirname", "realpath",
    "readlink", "find", "hostname", "printenv", "set", "ver",
    // Text filters / search (pipelines with `ls` / `dir` — smoke ornith E14)
    "grep", "egrep", "fgrep", "rg", "findstr",
];

static NETWORK: &[&str] = &[
    "curl",
    "wget",
    "ssh",
    "scp",
    "rsync",
    "nc",
    "netcat",
    "telnet",
    "dig",
    "nslookup",
    "host",
    "ping",
    "traceroute",
    "tracepath",
    "ftp",
    "sftp",
];

static MUTATING: &[&str] = &[
    "touch",
    "mkdir",
    "mv",
    "cp",
    "ln",
    "chmod",
    "chown",
    "chgrp",
    "install",
    "tee",
    // `sed` / `awk` → `classify_stream_filter` (ReadOnly unless -i / inplace)
    "perl",
    "python",
    "python3",
    "node",
    // cargo / npm / pnpm / yarn / tsc / npx / gh → `classify_toolchain`
    "make",
    "cmake",
    "ninja",
    "rustc",
    "gcc",
    "g++",
    "clang",
    "clang++",
    "strip",
    "ar",
    "tar",
    "zip",
    "unzip",
    "gzip",
    "gunzip",
    "bzip2",
    "xz",
    "docker",
    "kubectl",
    "terraform",
    "ansible",
    "helm",
];

static DESTRUCTIVE_PREFIX: &[&str] = &["rm", "dd", "mkfs", "shred"];

static GIT_READ: &[&str] = &[
    "status",
    "diff",
    "log",
    "show",
    "branch",
    "tag",
    "remote",
    "fetch",
    "grep",
    "rev-parse",
    "describe",
    "ls-files",
    "ls-tree",
    // `config` handled in `classify_git` (get vs write)
    "help",
    "version",
    "blame",
    "shortlog",
    "name-rev",
    "symbolic-ref",
    "rev-list",
];

static GIT_MUTATING: &[&str] = &[
    "add",
    "commit",
    "push",
    "pull",
    "merge",
    "rebase",
    "cherry-pick",
    "stash",
    "checkout",
    "switch",
    "restore",
    "reset",
    "clean",
    "mv",
    "rm",
];

// git push --force etc. : voir `DESTRUCTIVE_PATTERNS`

static DESTRUCTIVE_PATTERNS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        (
            Regex::new(r"\bgit\s+reset\s+--hard\b").expect("regex"),
            "may discard uncommitted changes",
        ),
        (
            Regex::new(r"\bgit\s+push\b[^;&|\n]*[ \t](--force|--force-with-lease|-f)\b")
                .expect("regex"),
            "may overwrite remote history",
        ),
        (
            Regex::new(r"\bgit\s+clean\b[^\n;|&]*-[a-zA-Z]*f").expect("regex"),
            "may permanently delete untracked files",
        ),
        (
            Regex::new(r"(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR][a-zA-Z]*f").expect("regex"),
            "may recursively force-remove files",
        ),
        (
            Regex::new(r"(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f[a-zA-Z]*[rR]").expect("regex"),
            "may recursively force-remove files",
        ),
        (
            Regex::new(r"(?i)\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b").expect("regex"),
            "may drop or truncate database objects",
        ),
        (
            Regex::new(r"\bkubectl\s+delete\b").expect("regex"),
            "may delete Kubernetes resources",
        ),
        (
            Regex::new(r"\bterraform\s+destroy\b").expect("regex"),
            "may destroy Terraform infrastructure",
        ),
        (
            Regex::new(r"\bgit\s+checkout\s+(--\s+)?\.[ \t]*($|[;&|\n])").expect("regex"),
            "may discard all working tree changes",
        ),
        (
            Regex::new(r"\bgit\s+restore\s+(--\s+)?\.[ \t]*($|[;&|\n])").expect("regex"),
            "may discard all working tree changes",
        ),
        (
            Regex::new(r"\bgit\s+stash[ \t]+(drop|clear)\b").expect("regex"),
            "may permanently remove stashed changes",
        ),
    ]
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_token_skips_env_assign() {
        assert_eq!(
            first_executable_token("NODE_ENV=prod npm install"),
            Some("npm")
        );
    }

    #[test]
    fn ls_is_read_only() {
        assert_eq!(kind_of_segment("ls -la"), BashCommandKind::ReadOnly);
    }

    #[test]
    fn curl_is_network() {
        assert_eq!(kind_of_segment("curl https://x"), BashCommandKind::Network);
    }

    #[test]
    fn rm_is_destructive_prefix() {
        assert_eq!(kind_of_segment("rm -f a"), BashCommandKind::Destructive);
    }

    #[test]
    fn git_status_read() {
        assert_eq!(kind_of_segment("git status"), BashCommandKind::ReadOnly);
    }

    #[test]
    fn cargo_check_and_npm_test_are_read_only() {
        assert_eq!(kind_of_segment("cargo check"), BashCommandKind::ReadOnly);
        assert_eq!(kind_of_segment("npm test"), BashCommandKind::ReadOnly);
        assert_eq!(kind_of_segment("pnpm run typecheck"), BashCommandKind::ReadOnly);
        assert_eq!(kind_of_segment("npm install lodash"), BashCommandKind::Mutating);
        assert_eq!(kind_of_segment("cargo build"), BashCommandKind::Mutating);
    }

    #[test]
    fn git_config_get_vs_write() {
        assert_eq!(
            kind_of_segment("git config --get user.name"),
            BashCommandKind::ReadOnly
        );
        assert_eq!(
            kind_of_segment("git config user.email a@b.c"),
            BashCommandKind::Mutating
        );
    }

    #[test]
    fn command_is_inspect_only_chains() {
        assert!(command_is_inspect_only("git status --short"));
        assert!(command_is_inspect_only("git status && git log -1"));
        assert!(command_is_inspect_only("cargo check"));
        assert!(command_is_inspect_only("FOO=1 git status"));
        assert!(!command_is_inspect_only("git add -A"));
        assert!(!command_is_inspect_only("git status && git add -A"));
        assert!(!command_is_inspect_only("echo hi > file.txt"));
    }

    #[test]
    fn fd_merge_redirects_are_not_file_writes() {
        assert!(!has_file_redirect("ls foo 2>&1"));
        assert!(!has_file_redirect("pwd 2>&1; echo ==="));
        assert!(!has_file_redirect("cmd 1>&2"));
        assert!(!has_file_redirect("cmd >&1"));
        assert!(!has_file_redirect("ls 2>/dev/null"));
        assert!(!has_file_redirect("ls 2>nul"));
        assert!(has_file_redirect("echo hi > file.txt"));
        assert!(has_file_redirect("echo hi >> file.txt"));
        assert!(has_file_redirect("echo hi 1>out.txt"));
        assert!(command_is_inspect_only("ls /tmp 2>&1"));
        assert!(command_is_inspect_only(
            "ls /tmp 2>&1; echo ---; ls /tmp | head -30"
        ));
        assert!(!command_is_inspect_only("echo hi > file.txt"));
    }

    #[test]
    fn stream_filters_and_pipelines_are_inspect_only() {
        assert_eq!(kind_of_segment("grep foo"), BashCommandKind::ReadOnly);
        assert_eq!(kind_of_segment("findstr /i test"), BashCommandKind::ReadOnly);
        assert_eq!(kind_of_segment("rg pattern"), BashCommandKind::ReadOnly);
        assert_eq!(
            kind_of_segment("awk '{print $NF}'"),
            BashCommandKind::ReadOnly
        );
        assert_eq!(kind_of_segment("sed 's/a/b/'"), BashCommandKind::ReadOnly);
        assert_eq!(kind_of_segment("sed -i 's/a/b/' f"), BashCommandKind::Mutating);
        assert_eq!(
            kind_of_segment("sed -i.bak 's/a/b/' f"),
            BashCommandKind::Mutating
        );
        assert_eq!(
            kind_of_segment("awk -i inplace '{print}' f"),
            BashCommandKind::Mutating
        );
        assert!(command_is_inspect_only(
            "ls -la | grep \"^-\" | awk '{print $NF}'"
        ));
        assert!(command_is_inspect_only("dir /b | findstr /i test"));
        assert!(command_is_inspect_only("ls -la | head -50"));
        assert!(!command_is_inspect_only("sed -i 's/a/b/' file.txt"));
    }

    #[test]
    fn destructive_hint_git_reset() {
        assert!(destructive_hint("git reset --hard").is_some());
    }

    #[test]
    fn permission_flags_read_only() {
        assert_eq!(
            permission_flags(BashCommandKind::ReadOnly),
            (false, true)
        );
    }

    #[test]
    fn auto_deny_rm_rf() {
        assert!(auto_deny_message("rm -rf /tmp/x").is_some());
    }

    #[test]
    fn auto_deny_skips_ls() {
        assert!(auto_deny_message("ls -la").is_none());
    }
}
