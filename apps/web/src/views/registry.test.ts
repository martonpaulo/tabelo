import { describe, expect, it } from "vitest";
import { listCodecs } from "@/formats";
import { editableViewForCodec, listViews } from "./registry";
import { canParse } from "./types";

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

// Tab inside a source editor is registry data (#54): every editable source view
// declares what it does, a view that moves between fields has a codec that can
// find them, and a view without a source editor claims nothing.

describe("source Tab declarations", () => {
	it("declares a Tab behaviour for every editable source view", () => {
		for (const view of listViews()) {
			if (view.kind === "source" && canParse(view)) {
				expect(view.capabilities.sourceTab).not.toBeNull();
			} else {
				expect(view.capabilities.sourceTab).toBeNull();
			}
		}
	});

	it("gives every field-navigating view a codec that reports fields", () => {
		for (const view of listViews()) {
			if (view.capabilities.sourceTab !== "next-field") continue;
			expect(view.codec?.sourceFields).toBeTypeOf("function");
		}
	});
});

// An imported or pasted source names a format, and the workspace can only open
// it through a view that reads and writes it. The mapping is a search over the
// registry rather than a table, so a newly registered format is openable with
// no edit anywhere.

describe("editable view for a format", () => {
	it("resolves a parsing view for every registered codec", () => {
		for (const codec of listCodecs()) {
			const view = editableViewForCodec(codec.id);
			expect(view?.codec?.id).toBe(codec.id);
			expect(view && canParse(view)).toBe(true);
		}
	});

	it("resolves the read-only preview's codec to the view that writes it", () => {
		const preview = listViews().find((view) => view.kind === "preview");
		const codecId = preview?.codec?.id;
		if (!codecId) throw new Error("Expected a preview view with a codec.");

		expect(editableViewForCodec(codecId)?.id).not.toBe(preview.id);
	});

	it("resolves nothing for content no codec owns", () => {
		// The two sources a paste can report that are not formats: text with no
		// grammar, and Tabelo's own private clipboard payload.
		expect(editableViewForCodec("text")).toBeNull();
		expect(editableViewForCodec("tabelo")).toBeNull();
	});
});
