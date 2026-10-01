#!/usr/bin/env python3
"""Filter git commit messages: drop Cursor Co-authored-by / Made-with trailers.

Used as: git filter-branch --msg-filter "python scripts/strip-cursor-coauthor-msg.py" ...
Also usable as a commit-msg hook: python scripts/strip-cursor-coauthor-msg.py PATH
"""
from __future__ import annotations

import re
import sys

DROP = re.compile(
	r'^(Co-authored-by:\s*Cursor\b|Made-with:\s*Cursor\b|Made with Cursor\b)',
	re.IGNORECASE,
)


def strip_message(text: str) -> str:
	lines = text.splitlines()
	kept = [line for line in lines if not DROP.match(line.strip())]
	while kept and kept[-1].strip() == '':
		kept.pop()
	return '\n'.join(kept) + ('\n' if kept else '')


def main() -> int:
	if len(sys.argv) >= 2:
		path = sys.argv[1]
		with open(path, encoding='utf-8') as f:
			original = f.read()
		cleaned = strip_message(original)
		if cleaned != original:
			with open(path, 'w', encoding='utf-8', newline='\n') as f:
				f.write(cleaned)
		return 0

	sys.stdout.write(strip_message(sys.stdin.read()))
	return 0


if __name__ == '__main__':
	raise SystemExit(main())
