#!/usr/bin/env python3
"""Check the mechanical rules AGENTS.md states in prose (#540).

    conventions.py [--root ROOT]

Each rule reads the files Git tracks under ROOT (default `.`), or every file when ROOT is not a Git
work tree; `node_modules` is always left out.

- `em-dash`: no tracked text holds U+2014, except `pnpm-lock.yaml`, which pnpm writes.
- `block-comment`: a script file (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`)
  writes its comments with `//`. A JSX comment, `{/* ... */}` in a `.tsx` or `.jsx` file, is exempt:
  JSX children have no `//` form, and a `//` there renders as text.
- `parent-import`: an import, export or `require` specifier never climbs a directory (`../x`,
  `./../x`); anything outside the current directory is reached through the `@/` alias.
- `e2e-sleep`: no browser test under `apps/web/e2e/` calls `waitForTimeout`; wait on an observable
  condition instead.

Prints `<file>:<line>: <rule>: <problem>` per hit, then exits 1 on any, 0 on none, 2 on a usage
error. Python's standard library and Git only. `scripts/test_conventions.py` proves each rule on
fixtures.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

EM_DASH = chr(0x2014)
EM_DASH_EXEMPT = {"pnpm-lock.yaml"}
SCRIPT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
JSX_SUFFIXES = {".tsx", ".jsx"}
E2E_PREFIX = "apps/web/e2e/"
SKIP_DIRS = {"node_modules"}

# A `/` after one of these characters, or after one of these words, starts a regular expression
# literal rather than a division.
REGEX_AFTER_CHARS = set("(,=:[!&|?{};+-*%<>~^")
REGEX_AFTER_WORDS = {
    "return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw",
    "yield", "await",
}
SPECIFIER = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'])([^"'\n]*)\1"""
)
SLEEP = re.compile(r"\bwaitForTimeout\b")


def tracked_files(root: Path) -> list[str]:
    """The files Git tracks under root, or every file when root is not a work tree."""
    try:
        listed = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], capture_output=True, check=False)
    except OSError:
        listed = None
    if listed is not None and listed.returncode == 0:
        names = [name for name in listed.stdout.decode("utf-8", "replace").split("\0") if name]
    else:
        names = [path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()]
    kept = []
    for name in sorted(names):
        if any(part in SKIP_DIRS for part in name.split("/")[:-1]):
            continue
        path = root / name
        if path.is_file() and not path.is_symlink():
            kept.append(name)
    return kept


class Lexed:
    """A script's text split into code, strings and comments, offsets kept.

    `code` blanks comments, `bare` blanks comments and string contents, each keeping every
    newline so offsets and line numbers still match the source. `blocks` lists each block
    comment as (start, end, is_jsx).
    """

    def __init__(self, text: str, jsx: bool) -> None:
        self.text = text
        code = list(text)
        bare = list(text)
        self.blocks: list[tuple[int, int, bool]] = []
        # Brace depth for each open template substitution, innermost last.
        templates: list[int] = []
        depth = 0
        last = ""  # The last significant code character, or word, for the regex rule.
        i = 0
        n = len(text)

        def blank(target: list[str], start: int, end: int) -> None:
            for k in range(start, end):
                if target[k] != "\n":
                    target[k] = " "

        while i < n:
            ch = text[i]
            nxt = text[i + 1] if i + 1 < n else ""
            if ch == "/" and nxt == "/":
                end = text.find("\n", i)
                end = n if end < 0 else end
                blank(code, i, end)
                blank(bare, i, end)
                i = end
                continue
            if ch == "/" and nxt == "*":
                end = text.find("*/", i + 2)
                end = n if end < 0 else end + 2
                before = text[:i].rstrip()
                after = text[end:].lstrip()
                is_jsx = jsx and before.endswith("{") and after.startswith("}")
                self.blocks.append((i, end, is_jsx))
                blank(code, i, end)
                blank(bare, i, end)
                i = end
                continue
            if ch in "'\"":
                end = self._quoted(text, i, ch)
                if end is None:
                    # No closing quote on the line: JSX text such as an apostrophe, not a string.
                    last = ch
                    i += 1
                    continue
                blank(bare, i + 1, end - 1)
                last = "a"
                i = end
                continue
            if ch == "`" or (ch == "}" and templates and templates[-1] == depth):
                if ch == "}":
                    templates.pop()
                    depth -= 1
                end, opens = self._template(text, i + 1)
                blank(bare, i + 1, end - (2 if opens else 1))
                i = end
                if opens:
                    depth += 1
                    templates.append(depth)
                    last = "{"
                else:
                    last = "a"
                continue
            if ch == "/" and (last == "" or last in REGEX_AFTER_CHARS or last in REGEX_AFTER_WORDS):
                end = self._regex(text, i)
                if end is not None:
                    blank(bare, i + 1, end - 1)
                    last = "a"
                    i = end
                    continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            if ch.isalnum() or ch in "_$":
                start = i
                while i < n and (text[i].isalnum() or text[i] in "_$"):
                    i += 1
                last = text[start:i]
                continue
            if not ch.isspace():
                last = ch
            i += 1
        self.code = "".join(code)
        self.bare = "".join(bare)

    @staticmethod
    def _quoted(text: str, start: int, quote: str) -> int | None:
        i = start + 1
        while i < len(text):
            ch = text[i]
            if ch == "\\":
                i += 2
                continue
            if ch == "\n":
                return None
            if ch == quote:
                return i + 1
            i += 1
        return None

    @staticmethod
    def _template(text: str, start: int) -> tuple[int, bool]:
        """From inside a template, the offset past its end or past an opening `${`."""
        i = start
        while i < len(text):
            ch = text[i]
            if ch == "\\":
                i += 2
                continue
            if ch == "`":
                return i + 1, False
            if ch == "$" and i + 1 < len(text) and text[i + 1] == "{":
                return i + 2, True
            i += 1
        return len(text), False

    @staticmethod
    def _regex(text: str, start: int) -> int | None:
        i = start + 1
        in_class = False
        while i < len(text):
            ch = text[i]
            if ch == "\\":
                i += 2
                continue
            if ch == "\n":
                return None
            if ch == "[":
                in_class = True
            elif ch == "]":
                in_class = False
            elif ch == "/" and not in_class:
                i += 1
                while i < len(text) and text[i].isalpha():
                    i += 1
                return i
            i += 1
        return None

    def line(self, offset: int) -> int:
        return self.text.count("\n", 0, offset) + 1


def check_em_dash(label: str, text: str) -> list[str]:
    if label in EM_DASH_EXEMPT:
        return []
    return [
        f"{label}:{number}: em-dash: U+2014 in tracked text; use a comma, colon, parentheses or a new sentence"
        for number, line in enumerate(text.splitlines(), start=1)
        if EM_DASH in line
    ]


def check_block_comments(label: str, lexed: Lexed) -> list[str]:
    return [
        f"{label}:{lexed.line(start)}: block-comment: write the comment with //"
        for start, _end, is_jsx in lexed.blocks
        if not is_jsx
    ]


def check_parent_imports(label: str, lexed: Lexed) -> list[str]:
    problems = []
    for match in SPECIFIER.finditer(lexed.code):
        specifier = match.group(2)
        if specifier.startswith(".") and ".." in specifier.split("/"):
            problems.append(
                f"{label}:{lexed.line(match.start(2))}: parent-import: '{specifier}' climbs a directory; import it through @/"
            )
    return problems


def check_sleeps(label: str, lexed: Lexed) -> list[str]:
    if not label.startswith(E2E_PREFIX):
        return []
    return [
        f"{label}:{lexed.line(match.start())}: e2e-sleep: waitForTimeout is an arbitrary sleep; wait on an observable condition"
        for match in SLEEP.finditer(lexed.bare)
    ]


def check(root: Path) -> list[str]:
    problems: list[str] = []
    for label in tracked_files(root):
        path = root / label
        try:
            raw = path.read_bytes()
        except OSError:
            continue
        if b"\0" in raw:
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeError:
            continue
        problems.extend(check_em_dash(label, text))
        if path.suffix not in SCRIPT_SUFFIXES:
            continue
        lexed = Lexed(text, path.suffix in JSX_SUFFIXES)
        problems.extend(check_block_comments(label, lexed))
        problems.extend(check_parent_imports(label, lexed))
        problems.extend(check_sleeps(label, lexed))
    return problems


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="conventions.py", description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".", help="repository root (default: .)")
    args = parser.parse_args(argv)
    root = Path(args.root)
    if not root.is_dir():
        print(f"conventions.py: not a directory: {root}", file=sys.stderr)
        return 2
    problems = check(root.resolve())
    for problem in problems:
        print(problem)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
