import { describe, expect, it } from "vitest";
import { layoutPresets } from "@/workspace/layout";
import { CURRENT_VERSION, validatePersistedState } from "./schema";

const document = {
	columns: [
		{ id: "c1", header: "Name", align: "left" },
		{ id: "c2", header: "Role", align: "default" },
	],
	rows: [{ id: "r1", cells: { c1: "Inez", c2: "Designer" } }],
};

function payload(overrides: Record<string, unknown> = {}) {
	return {
		version: CURRENT_VERSION,
		document,
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
		draft: null,
		...overrides,
	};
}

describe("loading a stored payload", () => {
	it("reports nothing stored", () => {
		expect(validatePersistedState(null).status).toBe("empty");
	});

	it("accepts a current payload", () => {
		const outcome = validatePersistedState(
			payload({
				draft: {
					paneId: "bd",
					viewId: "markdown",
					text: "| Name |\n| not valid |",
				},
			}),
		);
		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.draft?.text).toContain("not valid");
		expect(outcome.state.workspace.wrappedColumns).toEqual([]);
		expect(outcome.state.workspace.panes.map((pane) => pane.zoom)).toEqual([
			1, 1.2,
		]);
		expect(outcome.state.workspace.panes.map((pane) => pane.wrap)).toEqual([
			false,
			false,
		]);
	});

	it("preserves per-column wrapping in the current workspace schema", () => {
		const workspace = payload().workspace;
		const outcome = validatePersistedState(
			payload({ workspace: { ...workspace, wrappedColumns: ["c1"] } }),
		);
		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.workspace.wrappedColumns).toEqual(["c1"]);
	});

	it("preserves pane wrapping while defaulting older version-4 panes", () => {
		const workspace = payload().workspace;
		const outcome = validatePersistedState(
			payload({
				workspace: {
					...workspace,
					panes: workspace.panes.map((pane, index) =>
						index === 1 ? { ...pane, wrap: true } : pane,
					),
				},
			}),
		);
		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.workspace.panes.map((pane) => pane.wrap)).toEqual([
			false,
			true,
		]);
	});

	it("refuses every non-current version", () => {
		expect(
			validatePersistedState(payload({ version: CURRENT_VERSION - 1 })).status,
		).toBe("unreadable");
		expect(
			validatePersistedState(payload({ version: CURRENT_VERSION + 1 })).status,
		).toBe("unreadable");
	});

	it("refuses a payload with no version rather than guessing", () => {
		expect(validatePersistedState({ document }).status).toBe("unreadable");
	});

	it("refuses a payload whose shape does not match", () => {
		expect(
			validatePersistedState(payload({ document: { columns: [] } })).status,
		).toBe("unreadable");
	});

	it("accepts a workspace for every layout preset", () => {
		const views = ["grid", "markdown", "csv", "html-preview"] as const;

		for (const preset of layoutPresets) {
			const workspace = payload().workspace;
			const outcome = validatePersistedState(
				payload({
					workspace: {
						...workspace,
						layout: preset.id,
						panes: preset.panes.map((slots, index) => ({
							id: `pane-${index + 1}`,
							view: views[index],
							slots,
							zoom: 1,
						})),
						activePaneId: "pane-1",
					},
				}),
			);

			expect(outcome.status, preset.id).toBe("ok");
		}
	});

	// A payload Tabelo did not write may list the same tiling in any order. The
	// order is not part of the invariant, so rejecting it would send a workspace
	// that does tile its layout down the recovery path for nothing.
	it("accepts a valid tiling stored in any pane order", () => {
		const views = ["grid", "markdown", "csv", "html-preview"] as const;

		for (const preset of layoutPresets) {
			const workspace = payload().workspace;
			const outcome = validatePersistedState(
				payload({
					workspace: {
						...workspace,
						layout: preset.id,
						panes: preset.panes
							.map((slots, index) => ({
								id: `pane-${index + 1}`,
								view: views[index],
								slots,
								zoom: 1,
							}))
							.reverse(),
						activePaneId: "pane-1",
					},
				}),
			);

			expect(outcome.status, preset.id).toBe("ok");
		}
	});

	it("refuses a pane count that does not match the layout", () => {
		const workspace = payload().workspace;
		expect(
			validatePersistedState(
				payload({
					workspace: {
						...workspace,
						layout: "quad",
					},
				}),
			).status,
		).toBe("unreadable");
	});

	it.each([
		{
			name: "overlapping slots",
			panes: [
				{ id: "ac", view: "grid", slots: ["a", "c"], zoom: 1 },
				{ id: "ab", view: "markdown", slots: ["a", "b"], zoom: 1 },
			],
		},
		{
			name: "a missing slot",
			panes: [
				{ id: "ac", view: "grid", slots: ["a", "c"], zoom: 1 },
				{ id: "b", view: "markdown", slots: ["b"], zoom: 1 },
			],
		},
	])("refuses $name", ({ panes }) => {
		const workspace = payload().workspace;
		expect(
			validatePersistedState(payload({ workspace: { ...workspace, panes } }))
				.status,
		).toBe("unreadable");
	});

	it("refuses correctly covered slots grouped unlike the layout", () => {
		const workspace = payload().workspace;
		expect(
			validatePersistedState(
				payload({
					workspace: {
						...workspace,
						panes: [
							{ id: "ab", view: "grid", slots: ["a", "b"], zoom: 1 },
							{ id: "cd", view: "markdown", slots: ["c", "d"], zoom: 1 },
						],
					},
				}),
			).status,
		).toBe("unreadable");
	});

	it("refuses a workspace with only one pane", () => {
		const workspace = payload().workspace;
		expect(
			validatePersistedState(
				payload({
					workspace: { ...workspace, panes: workspace.panes.slice(0, 1) },
				}),
			).status,
		).toBe("unreadable");
	});

	it("refuses a duplicate view", () => {
		const workspace = payload().workspace;
		const outcome = validatePersistedState(
			payload({
				workspace: {
					...workspace,
					panes: workspace.panes.map((pane) => ({
						...pane,
						view: "grid",
					})),
				},
			}),
		);

		expect(outcome.status).toBe("unreadable");
	});

	it("refuses a draft whose pane owner is missing", () => {
		const outcome = validatePersistedState(
			payload({
				draft: { paneId: "missing", viewId: "markdown", text: "draft" },
			}),
		);

		expect(outcome.status).toBe("unreadable");
	});
});
