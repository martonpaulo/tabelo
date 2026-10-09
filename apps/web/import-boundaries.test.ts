import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The architecture boundaries AGENTS.md calls executable are Biome overrides in
// `biome.jsonc`, and an override's reach is decided by its include globs, which
// nothing else checks. Two of them once missed part of their scope: Tabelo's
// own shared components escaped the application-import restriction because the
// a11y exemption excluded them by name, and the view registry could import the
// shared UI package (#437). This lints probe files with the real configuration,
// in a temporary tree that mirrors the governed paths, so a glob that stops
// covering its scope fails here. It checks import specifiers only, not cycles.

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const biome = join(repositoryRoot, "node_modules", ".bin", "biome");

const RESTRICTED = "lint/style/noRestrictedImports";
const LABEL_WITHOUT_CONTROL = "lint/a11y/noLabelWithoutControl";

const appState =
	'import { store } from "@/state/store";\n\nexport const probe = store;\n';

const probes: Record<string, string> = {
	"apps/web/src/core/probe-react.ts":
		'import { useState } from "react";\n\nexport const probe = useState;\n',
	"apps/web/src/core/probe-allowed.ts":
		'import { cellText } from "@/core/types";\n\nexport const probe = cellText;\n',
	"apps/web/src/formats/probe-ui.ts":
		'import { Pane } from "@/ui/pane";\n\nexport const probe = Pane;\n',
	"apps/web/src/views/probe-codemirror.ts":
		'import { EditorView } from "@codemirror/view";\n\nexport const probe = EditorView;\n',
	"apps/web/src/views/probe-shared-ui.ts":
		'import { Button } from "@tabelo/ui/components/button";\n\nexport const probe = Button;\n',
	"apps/web/src/views/probe-allowed.ts":
		'import { listFormats } from "@/formats";\n\nexport const probe = listFormats;\n',
	// A vendored primitive and one of Tabelo's own components.
	"packages/ui/src/components/button.tsx": appState,
	"packages/ui/src/components/segmented-control.tsx": appState,
	"packages/ui/src/lib/probe.ts": appState,
	"packages/ui/src/components/label.tsx":
		"export function Probe() {\n\treturn <label>Name</label>;\n}\n",
	"packages/ui/src/components/shortcut-keys.tsx":
		'import { menuStyles } from "./menu-styles";\n\nexport const probe = menuStyles;\n\nexport function Probe() {\n\treturn <label>Name</label>;\n}\n',
};

let root: string;
let categories: Map<string, Set<string>>;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "tabelo-import-boundaries-"));
	copyFileSync(join(repositoryRoot, "biome.jsonc"), join(root, "biome.jsonc"));
	for (const [path, source] of Object.entries(probes)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), source);
	}
	const result = spawnSync(
		biome,
		["lint", "--reporter=json", "--max-diagnostics=none", "."],
		{ cwd: root, encoding: "utf8" },
	);
	const report = JSON.parse(result.stdout) as {
		diagnostics: { category: string; location: { path: string } }[];
	};
	categories = new Map();
	for (const { category, location } of report.diagnostics) {
		const found = categories.get(location.path) ?? new Set<string>();
		found.add(category);
		categories.set(location.path, found);
	}
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

function reports(path: string, category: string): boolean {
	return categories.get(path)?.has(category) ?? false;
}

describe("import boundaries in biome.jsonc", () => {
	it.each([
		"apps/web/src/core/probe-react.ts",
		"apps/web/src/formats/probe-ui.ts",
		"apps/web/src/views/probe-codemirror.ts",
		"apps/web/src/views/probe-shared-ui.ts",
		"packages/ui/src/components/button.tsx",
		"packages/ui/src/components/segmented-control.tsx",
		"packages/ui/src/lib/probe.ts",
	])("rejects the import in %s", (path) => {
		expect(reports(path, RESTRICTED)).toBe(true);
	});

	it.each([
		"apps/web/src/core/probe-allowed.ts",
		"apps/web/src/views/probe-allowed.ts",
		"packages/ui/src/components/shortcut-keys.tsx",
	])("allows the import in %s", (path) => {
		expect(reports(path, RESTRICTED)).toBe(false);
	});

	it("keeps the a11y exemption to vendored primitives", () => {
		expect(
			reports("packages/ui/src/components/label.tsx", LABEL_WITHOUT_CONTROL),
		).toBe(false);
		expect(
			reports(
				"packages/ui/src/components/shortcut-keys.tsx",
				LABEL_WITHOUT_CONTROL,
			),
		).toBe(true);
	});
});
