import { describe, expect, it } from "vitest";
import { listViews } from "./registry";

// Whether a view code-splits behind a lazy import is registry data, not a
// branch the pane renderer takes on a view's kind or id. See docs/adr/0005.
// The grid is eager by product decision; every other view shares CodeMirror
// or the preview's own lazily loaded bundle.

describe("view loading declarations", () => {
	it("keeps the grid eager and every other view lazy", () => {
		const loadingById = Object.fromEntries(
			listViews().map((view) => [view.id, view.loading]),
		);

		expect(loadingById.grid).toBe("eager");
		for (const [id, loading] of Object.entries(loadingById)) {
			if (id === "grid") continue;
			expect(loading).toBe("lazy");
		}
	});
});
