import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// docs/design-system.md §3 "Button hierarchy" is a rule, and four more dialogs
// are coming. A footer that reaches for a raw Button or DialogClose is how the
// rule drifts, so the boundary is asserted rather than trusted.

const uiRoot = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = `${directory}${entry.name}`;
		if (entry.isDirectory()) return sourceFiles(`${path}/`);
		return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
	});
}

describe("dialog footer boundary", () => {
	it("builds every dialog footer from the shared button wrappers", () => {
		const footers = sourceFiles(uiRoot)
			.map((path) => ({ path, source: readFileSync(path, "utf8") }))
			.flatMap(({ path, source }) =>
				[
					...source.matchAll(/<DialogFooter[^>]*>([\s\S]*?)<\/DialogFooter>/g),
				].map((match) => ({ path, body: match[1] })),
			);

		expect(footers.length).toBeGreaterThan(0);

		for (const { path, body } of footers) {
			expect(body, path).not.toMatch(/<Button\b/);
			expect(body, path).not.toMatch(/<DialogClose\b/);
			expect(body, path).toMatch(/<Dialog(Cancel|Confirm)\b/);
		}
	});
});
