//! Empreintes texte / tools (strict + familles bash/grep).

use super::outcome::PendingToolCall;

/// Hash stable d'un fragment de texte (trim).
pub(crate) fn hash_text(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.trim().hash(&mut h);
    h.finish()
}

/// Signature stable : `name` + args JSON (`id` ignoré).
pub(crate) fn hash_tool_calls(calls: &[PendingToolCall]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    calls.len().hash(&mut h);
    for c in calls {
        c.name.hash(&mut h);
        let args = serde_json::to_string(&c.arguments).unwrap_or_default();
        args.hash(&mut h);
    }
    h.finish()
}

/// Empreinte tools après normalisation (familles bash / grep).
pub(crate) fn hash_tool_calls_family(calls: &[PendingToolCall]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    calls.len().hash(&mut h);
    for c in calls {
        c.name.hash(&mut h);
        normalize_tool_args_for_loop_family(&c.name, &c.arguments).hash(&mut h);
    }
    h.finish()
}

pub(crate) fn is_targeted_tool_loop_family(calls: &[PendingToolCall]) -> bool {
    !calls.is_empty() && calls.iter().all(|c| c.name == "bash" || c.name == "grep")
}

pub(crate) fn normalize_tool_args_for_loop_family(name: &str, args: &serde_json::Value) -> String {
    match name {
        "bash" => {
            let cmd = args
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            normalize_bash_command_for_loop(cmd)
        }
        "grep" => {
            let pat = args
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .replace('\\', "/")
                .to_lowercase();
            let glob = args
                .get("glob")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            format!("{pat}|{path}|{glob}")
        }
        _ => serde_json::to_string(args).unwrap_or_default(),
    }
}

pub(crate) fn normalize_bash_command_for_loop(cmd: &str) -> String {
    let mut s = cmd.to_lowercase();
    loop {
        let next = strip_retry_noise(&s);
        if next == s {
            break;
        }
        s = next;
    }
    let mut segments: Vec<String> = split_bash_segments_for_loop(&s);
    segments.sort();
    segments.dedup();
    segments.join(" | ")
}

pub(crate) fn split_bash_segments_for_loop(s: &str) -> Vec<String> {
    let unified = s.replace("&&", "\n").replace('&', "\n").replace(';', "\n");
    unified
        .split('\n')
        .map(|part| part.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|part| !part.is_empty())
        .collect()
}

pub(crate) fn strip_retry_noise(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'(' {
            let rest = &s[i..];
            if rest.starts_with("(retry)") {
                i += "(retry)".len();
                continue;
            }
            if rest.starts_with("(retry ") {
                if let Some(end) = rest.find(')') {
                    let inner = &rest[7..end];
                    if !inner.is_empty() && inner.bytes().all(|b| b.is_ascii_digit()) {
                        i += end + 1;
                        continue;
                    }
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

pub(crate) fn combine_hash(a: u64, b: u64) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    a.hash(&mut h);
    b.hash(&mut h);
    h.finish()
}
