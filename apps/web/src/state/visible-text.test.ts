import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { type Draft, textForView, visibleTextForPane } from "./store";

// Copy source hands over what the pane is showing. The only case where that is
// not the document's projection is a pane holding its own uncommitted draft.
// including one that does not parse, which is exactly when copying it out is
// most useful.

const document = documentFromMatrix(
	[
		["Name", "Role"],
		["Inez", "Designer"],
	],
	{ headerRow: true },
);

function draft(overrides: Partial<Draft>): Draft {
	return {
		paneId: "pane-1",
		viewId: "markdown",
		text: "| Name |\n| not a divider |",
		status: "invalid",
		issues: [],
		warnings: [],
		...overrides,
	};
}

describe("the text a pane is showing", () => {
	it("is the document's projection when no draft exists", () => {
		expect(
			visibleTextForPane({ document, draft: null }, "pane-1", "markdown"),
		).toEqual(textForView(document, "markdown"));
	});

	it("is the owning pane's draft, byte for byte, even when it does not parse", () => {
		const pending = draft({});

		expect(
			visibleTextForPane({ document, draft: pending }, "pane-1", "markdown"),
		).toEqual({ ok: true, text: pending.text });
	});

	it("is the projection when the pane owns a draft in a different view", () => {
		const pending = draft({});

		expect(
			visibleTextForPane({ document, draft: pending }, "pane-1", "csv"),
		).toEqual(textForView(document, "csv"));
	});

	it("is a clean draft's own text, keeping the user's formatting", () => {
		const pending = draft({
			status: "clean",
			text: "| Name  |  Role |\n| --- | --- |\n| Inez | Designer |",
		});

		expect(
			visibleTextForPane({ document, draft: pending }, "pane-1", "markdown"),
		).toEqual({ ok: true, text: pending.text });
	});

	it("round-trips every copyable view's projection through its own codec", () => {
		for (const view of listViews()) {
			if (!view.capabilities.textClipboard) continue;
			const text = visibleTextForPane(
				{ document, draft: null },
				"pane-1",
				view.id,
			);
			expect(text.ok).toBe(true);
			if (text.ok) expect(text.text.length).toBeGreaterThan(0);
			expect(text).toEqual(textForView(document, view.id));
		}
	});
});

describe("which views offer Copy source", () => {
	// The registry decides, so adding a format needs no edit in the pane menu.
	it("covers every source view and excludes the grid and the preview", () => {
		const copyable = listViews()
			.filter((view) => view.capabilities.textClipboard)
			.map((view) => view.id);

		expect(copyable).toEqual<ViewId[]>([
			"markdown",
			"csv",
			"tsv",
			"html",
			"jira",
			"json",
		]);
		expect(copyable).not.toContain("grid");
		expect(copyable).not.toContain("html-preview");
	});

	it("only offers it where there is text to hand over", () => {
		for (const view of listViews()) {
			if (!view.capabilities.textClipboard) continue;
			expect(view.codec).toBeDefined();
		}
	});
});
