#!/usr/bin/env python3
"""Fixture tests for conventions.py: each rule passes a clean tree and names a broken one.

    python3 -m unittest discover -s scripts -p 'test_*.py'
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("conventions.py")
# Spelled by code point, so this file passes the rule it tests.
DASH = chr(0x2014)


def run(files: dict[str, str]) -> tuple[int, list[str]]:
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        for name, text in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(root)], capture_output=True, text=True, check=False
        )
    return result.returncode, result.stdout.splitlines()


class Rules(unittest.TestCase):
    def assert_fails(self, files: dict[str, str], expected: str) -> None:
        code, lines = run(files)
        self.assertEqual(code, 1, lines)
        self.assertEqual(len(lines), 1, lines)
        self.assertTrue(lines[0].startswith(f"{expected}: "), lines)

    def assert_passes(self, files: dict[str, str]) -> None:
        code, lines = run(files)
        self.assertEqual((code, lines), (0, []))

    def test_em_dash(self) -> None:
        self.assert_fails({"notes.md": f"one\ntwo {DASH} three\n"}, "notes.md:2: em-dash")
        self.assert_passes({"notes.md": "two, three\n", "pnpm-lock.yaml": f"a: {DASH}\n"})

    def test_block_comment(self) -> None:
        self.assert_fails(
            {"src/a.ts": 'const glob = "**/*.ts";\n/* a note */\nexport const a = glob;\n'},
            "src/a.ts:2: block-comment",
        )
        self.assert_fails({"src/a.tsx": "/** Doc. */\nexport const a = 1;\n"}, "src/a.tsx:1: block-comment")
        self.assert_passes(
            {
                "src/a.ts": 'const glob = "**/*.ts";\nconst re = /a\\/*b/;\n// a note\nexport const a = [glob, re];\n',
                "src/b.tsx": "export const B = () => (\n\t<p>\n\t\t{/* JSX has no // form. */}\n\t\tIt's here\n\t</p>\n);\n",
                "src/c.ts": "export const c = `path/*${1}*/`;\n",
            }
        )

    def test_jsx_exemption_is_only_for_jsx_files(self) -> None:
        self.assert_fails({"src/a.ts": "export const a = {/* note */};\n"}, "src/a.ts:1: block-comment")

    def test_parent_import(self) -> None:
        self.assert_fails(
            {"src/a/b.ts": 'import { c } from "../c";\nexport const b = c;\n'}, "src/a/b.ts:1: parent-import"
        )
        self.assert_fails(
            {"src/a/b.ts": 'export const b = await import("./../c");\n'}, "src/a/b.ts:1: parent-import"
        )
        self.assert_passes(
            {"src/a/b.ts": 'import { c } from "./c";\nimport { d } from "@/d";\n// from "../e"\nexport const b = [c, d];\n'}
        )

    def test_e2e_sleep(self) -> None:
        self.assert_fails(
            {"apps/web/e2e/a.spec.ts": "await page.waitForTimeout(100);\n"}, "apps/web/e2e/a.spec.ts:1: e2e-sleep"
        )
        self.assert_passes(
            {
                "apps/web/e2e/a.spec.ts": "// never waitForTimeout\nawait expect(cell).toBeVisible();\n",
                "apps/web/src/a.ts": "export const waitForTimeout = 1;\n",
            }
        )


    def test_network_outside_its_owner(self) -> None:
        self.assert_fails({"apps/web/src/core/a.ts": 'export const a = fetch("x");\n'}, "apps/web/src/core/a.ts:1: network")
        self.assert_fails(
            {"apps/web/src/ui/a.ts": 'export const a = globalThis.fetch("x");\n'}, "apps/web/src/ui/a.ts:1: network"
        )
        self.assert_fails(
            {"packages/ui/src/a.ts": 'navigator.sendBeacon("/x", "");\n'}, "packages/ui/src/a.ts:1: network"
        )
        self.assert_fails(
            {"apps/web/src/ui/a.ts": "export const a = new WebSocket(address);\n"}, "apps/web/src/ui/a.ts:1: network"
        )

    def test_storage_outside_its_owner(self) -> None:
        self.assert_fails(
            {"apps/web/src/ui/a.ts": 'export const a = localStorage.getItem("k");\n'}, "apps/web/src/ui/a.ts:1: storage"
        )
        self.assert_fails(
            {"apps/web/src/ui/a.ts": 'export const a = window.localStorage.getItem("k");\n'},
            "apps/web/src/ui/a.ts:1: storage",
        )
        self.assert_fails(
            {"apps/web/src/persistence/a.ts": "export const a = window.indexedDB;\n"},
            "apps/web/src/persistence/a.ts:1: storage",
        )

    def test_owners_tests_and_documentation_pass(self) -> None:
        self.assert_passes(
            {
                "apps/web/src/persistence/a.ts": 'export const a = window.localStorage.getItem("k");\n',
                "apps/web/src/preferences/a.ts": "export const a = () => window.localStorage;\n",
                "apps/web/src/agent/a.ts": "export const a = (port: number) => new WebSocket(`ws://127.0.0.1:${port}/agent`);\n",
                "apps/web/src/ui/a.test.ts": 'localStorage.setItem("k", "v");\n',
                "apps/web/e2e/a.spec.ts": "await page.evaluate(() => localStorage.clear());\n",
                "apps/web/src/copy/a.ts": '// Only a reload can fetch it again.\nexport const a = "https://example.com/docs";\nexport const b = table.fetch;\n',
                "apps/agent-bridge/src/a.ts": 'import { WebSocket } from "ws";\nexport const a = WebSocket;\n',
            }
        )

    def test_request_target_is_loopback_even_in_an_owner(self) -> None:
        self.assert_fails(
            {"apps/web/src/agent/a.ts": 'export const a = new WebSocket("wss://example.com/agent");\n'},
            "apps/web/src/agent/a.ts:1: request-target",
        )


if __name__ == "__main__":
    unittest.main()
