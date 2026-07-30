import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const genericConsumers = [
	"../state/store.ts",
	"../ui/download-dialog.tsx",
	"../ui/source/blocked-state.tsx",
	"../ui/workspace/pane-content.tsx",
	"../ui/workspace/pane-menu.tsx",
];

describe("codec precondition boundary", () => {
	it("keeps format identities out of shared precondition consumers", () => {
		for (const relativePath of genericConsumers) {
			const source = readFileSync(
				fileURLToPath(new URL(relativePath, import.meta.url)),
				"utf8",
			);
			expect(source.toLowerCase()).not.toMatch(/\b(json|records)\b/);
		}
	});
});
