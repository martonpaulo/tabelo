#!/usr/bin/env python3
"""No test proves «nothing happened», or waits for work, by sleeping (#740).

    sleep_guard.py [ROOT]

A sleep in a test (`time.Sleep(`, `time.sleep(`, `sleep(`, `Task.sleep(`, `Thread.sleep(`,
`usleep(`, `waitForTimeout(`, a shell `sleep 1`) needs a `timing-independent:` note on its line or
the line above, saying why the time cannot change the result: a poll with a deadline, a fake that
stands for slow work. A check that nothing arrived waits on a signal instead; a known one not fixed
yet carries `timing-dependent (#N):`, naming the open issue that removes it.

A test file is `*_test.go`, `test_*.py`, `*_test.py`, `*.test.*`, `*.spec.*`, `*Tests.swift`,
`*Test.swift`, or a code file in a `tests`, `Tests`, `test` or `__tests__` folder. Dot folders,
`node_modules`, `vendor`, `third_party` and `.build` are left out. Prints one line per finding and
exits 1 on any, 2 on a usage error. Python's standard library only. Adapted from Panoram's
tools/sleep_guard.py (the owner's own code), which reads Go only.

shortcut: a regex per line, not a parser, so a sleep inside a string counts (a fake's code usually
is one) and a trailing comment that names a sleep counts too; a parser would need each language's
toolchain in every gate.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

NOTE = "timing-independent:"
DEBT = re.compile(r"timing-dependent \(#\d+\):")
CODE = {".go", ".py", ".sh", ".bash", ".zsh", ".swift", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
        ".rb", ".kt", ".java", ".rs"}
TEST_NAME = re.compile(r"(_test\.go|^test_.*\.py|_test\.py|\.(test|spec)\.[^.]+|Tests?\.swift)$")
TEST_DIRS = {"tests", "Tests", "test", "__tests__"}
SKIP_DIRS = {"node_modules", "vendor", "third_party", ".build"}
SLEEP = re.compile(
    r"(\b(time\.Sleep|sleep|usleep|waitForTimeout)\s*\("
    r"|(^|[\s;&|({`])sleep\s+[\d$.])"
)
COMMENT = ("#", "//", "/*")


def is_test(path: Path, root: Path) -> bool:
    if path.suffix not in CODE:
        return False
    return bool(TEST_NAME.search(path.name)) or any(
        part in TEST_DIRS for part in path.relative_to(root).parts[:-1]
    )


def problems(root: Path) -> list[str]:
    found = []
    for folder, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(files):
            path = Path(folder, name)
            if not is_test(path, root):
                continue
            try:
                lines = path.read_text(encoding="utf-8").split("\n")
            except (OSError, UnicodeError):
                continue
            for index, line in enumerate(lines):
                if line.lstrip().startswith(COMMENT) or not SLEEP.search(line):
                    continue
                near = line + (lines[index - 1] if index else "")
                if NOTE in near or DEBT.search(near):
                    continue
                found.append(
                    f"{path.relative_to(root).as_posix()}:{index + 1}: a sleep in a test without a "
                    f"«{NOTE}» note; wait on the condition, or name the open issue with "
                    "«timing-dependent (#N):» (#740)"
                )
    return found


def main(argv: list[str]) -> int:
    if len(argv) > 1 or (argv and not Path(argv[0]).is_dir()):
        print("usage: sleep_guard.py [ROOT]", file=sys.stderr)
        return 2
    found = problems(Path(argv[0] if argv else "."))
    for problem in found:
        print(problem)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
