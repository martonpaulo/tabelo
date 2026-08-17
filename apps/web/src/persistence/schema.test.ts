import { describe, expect, it } from "vitest";
import { layoutPresets } from "@/workspace/layout";
import v1 from "./fixtures/v1.json";
import v2 from "./fixtures/v2.json";
import v3 from "./fixtures/v3.json";
import v4 from "./fixtures/v4.json";
import v5 from "./fixtures/v5.json";
import v6 from "./fixtures/v6.json";
import v7 from "./fixtures/v7.json";
import { CURRENT_VERSION, validatePersistedState } from "./schema";

const document = {
	columns: [
		{ id: "c1", header: "Name", align: "left", expectedType: "text" },
		{ id: "c2", header: "Role", align: "default", expectedType: "text" },
	],
	rows: [{ id: "r1", cells: { c1: "Ingrid", c2: "Designer" } }],
};

function payload(overrides: Record<string, unknown> = {}) {
	return {
		version: CURRENT_VERSION,
		name: "Project roles",
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
			columnWidths: {},
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

	it("migrates v4 document widths into the current workspace schema", () => {
		const outcome = validatePersistedState(v4);

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.workspace.columnWidths).toEqual({ "c-name": 18 });
		expect(
			outcome.state.document.columns.every((column) => !("width" in column)),
		).toBe(true);
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

	it.each([
		["v1", v1],
		["v2", v2],
		["v3", v3],
		["v4", v4],
		["v5", v5],
		["v6", v6],
		["v7", v7],
	] as const)(
		"loads the stored %s fixture as current state",
		(_name, fixture) => {
			const outcome = validatePersistedState(fixture);

			expect(outcome.status).toBe("ok");
			if (outcome.status !== "ok") return;
			expect(outcome.state.version).toBe(CURRENT_VERSION);
			expect(outcome.state.document.rows[0]?.cells["c-name"]).toBe("Ingrid");
		},
	);

	it("requires a trimmed non-empty name within 120 Unicode code points", () => {
		expect(validatePersistedState(payload({ name: "" }))).toEqual({
			status: "unreadable",
			reason: "current-schema-invalid",
		});
		expect(validatePersistedState(payload({ name: "😀".repeat(121) }))).toEqual(
			{ status: "unreadable", reason: "current-schema-invalid" },
		);
		expect(
			validatePersistedState(payload({ name: " Project roles " })),
		).toEqual({ status: "unreadable", reason: "current-schema-invalid" });
	});

	it("migrates v5 columns to the text expectation with values untouched", () => {
		const outcome = validatePersistedState(v5);

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(
			outcome.state.document.columns.every(
				(column) => column.expectedType === "text",
			),
		).toBe(true);
		expect(outcome.state.document.rows.map((row) => row.cells)).toEqual(
			v5.document.rows.map((row) => row.cells),
		);
	});

	it("accepts every scalar variant in a stored cell", () => {
		const outcome = validatePersistedState(
			payload({
				document: {
					columns: document.columns,
					rows: [{ id: "r1", cells: { c1: 42, c2: null } }],
				},
			}),
		);

		expect(outcome.status).toBe("ok");
		if (outcome.status !== "ok") return;
		expect(outcome.state.document.rows[0]?.cells).toEqual({ c1: 42, c2: null });
	});

	// `JSON.stringify` writes these as `null`, so accepting them would turn a
	// number into a different type on the next load rather than preserving it.
	it.each([Number.NaN, Number.POSITIVE_INFINITY])(
		"refuses %p as a stored cell value",
		(cell) => {
			expect(
				validatePersistedState(
					payload({
						document: {
							columns: document.columns,
							rows: [{ id: "r1", cells: { c1: cell } }],
						},
					}),
				),
			).toEqual({ status: "unreadable", reason: "current-schema-invalid" });
		},
	);

	it("classifies future and invalid current payloads without prose", () => {
		expect(
			validatePersistedState(payload({ version: CURRENT_VERSION + 1 })),
		).toEqual({ status: "unreadable", reason: "future-version" });
		expect(
			validatePersistedState(payload({ document: { columns: [] } })),
		).toEqual({ status: "unreadable", reason: "current-schema-invalid" });
	});

	it("refuses a payload with no version rather than guessing", () => {
		expect(validatePersistedState({ document })).toEqual({
			status: "unreadable",
			reason: "current-schema-invalid",
		});
	});

	it("does not coerce a string version into a shipped version", () => {
		expect(validatePersistedState({ ...v1, version: "1" })).toEqual({
			status: "unreadable",
			reason: "current-schema-invalid",
		});
	});

	it("classifies an invalid historical source as a migration failure", () => {
		expect(
			validatePersistedState({
				...v2,
				workspace: { ...v2.workspace, panes: [] },
			}),
		).toEqual({ status: "unreadable", reason: "migration-failed" });
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
