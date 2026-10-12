#!/usr/bin/env python3
"""Inventory drox-prompts catalogue bodies (chars / approx tokens)."""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"


def extract_rstrings(text: str) -> list[tuple[str, str]]:
    """Return (approx_name, body) for pub const ... = r\"...\" or r#\"...\"#."""
    out: list[tuple[str, str]] = []
    # r#"..."#
    for m in re.finditer(
        r'pub const ([A-Z0-9_]+):[^=]*=\s*r#"(.*?)"#\s*;',
        text,
        re.S,
    ):
        out.append((m.group(1), m.group(2)))
    # r"..." (non-greedy, no nested)
    for m in re.finditer(
        r'pub const ([A-Z0-9_]+):[^=]*=\s*r"(.*?)"\s*;',
        text,
        re.S,
    ):
        name = m.group(1)
        if any(n == name for n, _ in out):
            continue
        out.append((name, m.group(2)))
    # normal "..." multi-line via \
    for m in re.finditer(
        r'pub const ([A-Z0-9_]+):[^=]*=\s*((?:"(?:\\.|[^"\\])*"\s*)+);',
        text,
        re.S,
    ):
        name = m.group(1)
        if "PROMPT" not in name and "NUDGE" not in name and "DESCRIPTION" not in name and "SUPPLEMENT" not in name and "BODY" not in name:
            if name.endswith("_ENTRY"):
                continue
        raw = m.group(2)
        parts = re.findall(r'"(.*?)"', raw, re.S)
        body = "".join(bytes(p, "utf-8").decode("unicode_escape") if "\\" in p else p for p in parts)
        # simpler join
        body = "".join(parts).encode("utf-8").decode("unicode_escape")
        if any(n == name for n, _ in out):
            continue
        if len(body) < 40:
            continue
        out.append((name, body))
    return out


def approx_tokens(chars: int) -> int:
    return max(1, chars // 4)


def main() -> int:
    by_file: dict[str, list[tuple[str, int]]] = defaultdict(list)
    total = 0
    rows: list[tuple[str, str, int]] = []
    for path in sorted(ROOT.rglob("*.rs")):
        text = path.read_text(encoding="utf-8")
        for name, body in extract_rstrings(text):
            n = len(body)
            if n < 80:
                continue
            rel = str(path.relative_to(ROOT))
            by_file[rel].append((name, n))
            rows.append((rel, name, n))
            total += n

    rows.sort(key=lambda x: -x[2])
    print("=== TOP bodies by chars ===")
    for rel, name, n in rows[:40]:
        print(f"{n:6d} ~{approx_tokens(n):5d} tok  {name}  ({rel})")
    print()
    print(f"Bodies counted: {len(rows)}  sum_chars={total}  ~{approx_tokens(total)} tok (naive /4)")
    print()
    # Scenario estimates
    session_names = {
        "CORE_SYSTEM_PROMPT",
        "SUBAGENTS_EXPLORE_SUPPLEMENT",
        "NATIVE_THINKING_REASONING_SUPPLEMENT",
        "ALLOW_OUTSIDE_WORKSPACE_READ_SUPPLEMENT",
        "TASK_TOOL_DESCRIPTION",
        "EXPLORE_SYSTEM_PROMPT",
        "FILE_READ_TOOL_DESCRIPTION",
    }
    print("=== Boot-ish blobs (if present) ===")
    boot = 0
    for rel, name, n in rows:
        if name in session_names or name.endswith("_TOOL_DESCRIPTION"):
            if "TOOL" in name and name not in ("TASK_TOOL_DESCRIPTION", "FILE_READ_TOOL_DESCRIPTION", "EXPLORE_COMMIT_TOOL_DESCRIPTION", "EXPLORE_ARTIFACT_READ_TOOL_DESCRIPTION", "EXPLORE_INDEX_LIST_TOOL_DESCRIPTION", "TODO_WRITE_TOOL_DESCRIPTION", "BASH_TOOL_DESCRIPTION", "GREP_TOOL_DESCRIPTION"):
                continue
            print(f"{n:6d}  {name}")
            if name in session_names or name.endswith("TOOL_DESCRIPTION"):
                boot += n
    # all tool descriptions
    tools = sum(n for _, name, n in rows if name.endswith("_TOOL_DESCRIPTION") or name.endswith("TOOL_DESCRIPTION"))
    # fix: count tools properly
    tools = sum(n for _, name, n in rows if "TOOL_DESCRIPTION" in name)
    session = sum(n for _, name, n in rows if name in {
        "CORE_SYSTEM_PROMPT",
        "SUBAGENTS_EXPLORE_SUPPLEMENT",
        "NATIVE_THINKING_REASONING_SUPPLEMENT",
        "ALLOW_OUTSIDE_WORKSPACE_READ_SUPPLEMENT",
        "ALLOW_OUTSIDE_WORKSPACE_WRITE_SUPPLEMENT",
    })
    runtime = sum(n for _, name, n in rows if "NUDGE" in name or name.endswith("_FRAME") or "FRAME" in name)
    # runtime consts often named *_NUDGE
    runtime = sum(n for _, name, n in rows if name.endswith("_NUDGE") or name.endswith("_PROMPT") and name not in ("CORE_SYSTEM_PROMPT", "COMPACTION_PROMPT", "EXPLORE_SYSTEM_PROMPT", "EXPLORE_REPORT_SYSTEM_PROMPT"))
    print()
    print(f"Approx session supplements+core chars: {session} (~{approx_tokens(session)} tok)")
    print(f"Approx all TOOL_DESCRIPTION chars: {tools} (~{approx_tokens(tools)} tok)")
    print(f"Approx NUDGE/PROMPT rescue chars (sum all, not simultaneous): {runtime}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
