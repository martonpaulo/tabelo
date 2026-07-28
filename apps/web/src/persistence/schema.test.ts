import { describe, expect, it } from "vitest";
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
		expect(outcome.state.workspace.panes.map((pane) => pane.zoom)).toEqual([
			1, 1.2,
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
