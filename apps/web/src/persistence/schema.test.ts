import { describe, expect, it } from "vitest";
import { CURRENT_VERSION, migrateAndValidate } from "./schema";

// Anyone who used Tabelo before the workspace existed has a v1 payload in
// their browser. Losing it would be exactly the silent data loss the product
// promises not to cause, so the migration is covered rather than assumed.

const v1Document = {
	columns: [
		{ id: "c1", header: "Name", align: "left" },
		{ id: "c2", header: "Role", align: "default" },
	],
	rows: [{ id: "r1", cells: { c1: "Ana", c2: "Designer" } }],
};

describe("loading a stored payload", () => {
	it("reports nothing stored", () => {
		expect(migrateAndValidate(null).status).toBe("empty");
	});

	it("accepts a current payload", () => {
		const outcome = migrateAndValidate({
			version: CURRENT_VERSION,
			document: v1Document,
			workspace: {
				layout: "columns",
				panes: [
					{ id: "ac", view: "grid", slots: ["a", "c"], zoom: 1 },
					{ id: "bd", view: "markdown", slots: ["b", "d"], zoom: 1.2 },
				],
				columnRatio: 0.5,
				rowRatio: 0.5,
				activePaneId: "ac",
			},
			draft: {
				paneId: "bd",
				viewId: "markdown",
				text: "| Name |\n| not valid |",
			},
		});
		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.draft?.text).toContain("not valid");
		expect(outcome.state.workspace.panes.map((pane) => pane.zoom)).toEqual([
			1, 1.2,
		]);
	});

	it("refuses a pane zoom outside the supported range", () => {
		const outcome = migrateAndValidate({
			version: CURRENT_VERSION,
			document: v1Document,
			workspace: {
				layout: "single",
				panes: [
					{ id: "only", view: "grid", slots: ["a", "b", "c", "d"], zoom: 12 },
				],
				columnRatio: 0.5,
				rowRatio: 0.5,
				activePaneId: "only",
			},
			draft: null,
		});

		expect(outcome.status).toBe("unreadable");
	});

	it("refuses a payload with no version rather than guessing", () => {
		const outcome = migrateAndValidate({ document: v1Document });
		expect(outcome.status).toBe("unreadable");
	});

	it("refuses a payload from a newer version", () => {
		const outcome = migrateAndValidate({
			version: CURRENT_VERSION + 1,
			document: v1Document,
		});
		expect(outcome.status).toBe("unreadable");
	});

	it("refuses a payload whose shape does not match", () => {
		const outcome = migrateAndValidate({
			version: CURRENT_VERSION,
			document: { columns: [] },
		});
		expect(outcome.status).toBe("unreadable");
	});

	it("refuses a draft whose pane owner is missing", () => {
		const outcome = migrateAndValidate({
			version: CURRENT_VERSION,
			document: v1Document,
			workspace: {
				layout: "single",
				panes: [
					{ id: "only", view: "grid", slots: ["a", "b", "c", "d"], zoom: 1 },
				],
				columnRatio: 0.5,
				rowRatio: 0.5,
				activePaneId: "only",
			},
			draft: {
				paneId: "missing",
				viewId: "markdown",
				text: "draft",
			},
		});

		expect(outcome.status).toBe("unreadable");
	});
});

describe("migrating previous versions", () => {
	it("keeps the document and puts the old format beside the grid", () => {
		const outcome = migrateAndValidate({
			version: 1,
			document: v1Document,
			textFormat: "csv",
			textPanelVisible: true,
		});

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;

		expect(outcome.state.document.rows[0].cells.c1).toBe("Ana");
		expect(outcome.state.workspace.layout).toBe("columns");
		expect(outcome.state.workspace.panes.map((pane) => pane.view)).toEqual([
			"grid",
			"csv",
		]);
		expect(outcome.state.draft).toBeNull();
	});

	it("turns a hidden source panel into the single layout", () => {
		const outcome = migrateAndValidate({
			version: 1,
			document: v1Document,
			textFormat: "markdown",
			textPanelVisible: false,
		});

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.workspace.layout).toBe("single");
		expect(outcome.state.workspace.panes).toHaveLength(1);
		expect(outcome.state.workspace.panes[0].view).toBe("grid");
	});

	it("defaults to showing the source when the old flag was absent", () => {
		const outcome = migrateAndValidate({ version: 1, document: v1Document });
		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.workspace.panes).toHaveLength(2);
		expect(outcome.state.workspace.panes[1].view).toBe("markdown");
	});

	it("adds an empty draft to a v2 payload", () => {
		const outcome = migrateAndValidate({
			version: 2,
			document: v1Document,
			workspace: {
				layout: "single",
				panes: [{ id: "only", view: "grid", slots: ["a", "b", "c", "d"] }],
				columnRatio: 0.5,
				rowRatio: 0.5,
				activePaneId: "only",
			},
		});

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.draft).toBeNull();
	});

	it("gives every pane stored before zoom existed the default scale", () => {
		const outcome = migrateAndValidate({
			version: 3,
			document: v1Document,
			workspace: {
				layout: "columns",
				panes: [
					{ id: "ac", view: "grid", slots: ["a", "c"] },
					{ id: "bd", view: "markdown", slots: ["b", "d"] },
				],
				columnRatio: 0.4,
				rowRatio: 0.5,
				activePaneId: "bd",
			},
			draft: null,
		});

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.workspace.panes.map((pane) => pane.zoom)).toEqual([
			1, 1,
		]);
		// The rest of the workspace survives the migration untouched.
		expect(outcome.state.workspace.columnRatio).toBe(0.4);
		expect(outcome.state.workspace.activePaneId).toBe("bd");
		expect(outcome.state.workspace.panes.map((pane) => pane.view)).toEqual([
			"grid",
			"markdown",
		]);
	});

	it("carries a v1 payload all the way to the current version", () => {
		const outcome = migrateAndValidate({
			version: 1,
			document: v1Document,
			textFormat: "csv",
			textPanelVisible: true,
		});

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.version).toBe(CURRENT_VERSION);
		expect(outcome.state.workspace.panes.every((pane) => pane.zoom === 1)).toBe(
			true,
		);
	});
});
