import { describe, expect, it } from "vitest";
import {
	applyLayout,
	createDefaultWorkspace,
	gridAreaOf,
	type LayoutId,
	layoutPresets,
	layoutSplitsColumns,
	layoutSplitsRows,
	SLOT_ORDER,
	type SlotId,
} from "./layout";

// The invariant that makes the workspace safe: every preset tiles the 2x2 grid
// exactly once. A preset that leaves a hole or overlaps would render panes on
// top of each other.

describe("layout presets", () => {
	it.each(layoutPresets.map((preset) => [preset.id, preset] as const))(
		"%s covers every slot exactly once",
		(_id, preset) => {
			const seen = preset.panes.flatMap((slots) => [...slots]);
			expect([...seen].sort()).toEqual([...SLOT_ORDER].sort());
		},
	);

	it.each(layoutPresets.map((preset) => [preset.id, preset] as const))(
		"%s only contains rectangular panes",
		(_id, preset) => {
			for (const slots of preset.panes) {
				const area = gridAreaOf(slots);
				const width = area.columnEnd - area.columnStart;
				const height = area.rowEnd - area.rowStart;
				// A rectangle's slot count is exactly its width times its height;
				// an L-shape would not satisfy this.
				expect(width * height).toBe(slots.length);
			}
		},
	);

	it("reports a split axis only when some pane occupies a single track", () => {
		expect(layoutSplitsColumns("single")).toBe(false);
		expect(layoutSplitsRows("single")).toBe(false);
		expect(layoutSplitsColumns("columns")).toBe(true);
		expect(layoutSplitsRows("columns")).toBe(false);
		expect(layoutSplitsColumns("rows")).toBe(false);
		expect(layoutSplitsRows("rows")).toBe(true);
		expect(layoutSplitsColumns("quad")).toBe(true);
		expect(layoutSplitsRows("quad")).toBe(true);
	});
});

describe("applying a layout", () => {
	it("carries existing views across in reading order", () => {
		const before = applyLayout("columns");
		const chosen = [
			{ ...before[0], view: "csv" as const },
			{ ...before[1], view: "jira" as const },
		];
		const after = applyLayout("quad", chosen);

		expect(after).toHaveLength(4);
		expect(after[0].view).toBe("csv");
		expect(after[1].view).toBe("jira");
	});

	it("fills panes a smaller layout did not have", () => {
		const after = applyLayout("quad", [
			{ id: "abcd", view: "grid", slots: ["a", "b", "c", "d"] },
		]);
		expect(after).toHaveLength(4);
		expect(after[0].view).toBe("grid");
		expect(after.every((pane) => pane.view.length > 0)).toBe(true);
	});

	it("keeps the grid when collapsing to a single pane", () => {
		const wide = applyLayout("quad");
		const single = applyLayout("single", wide);
		expect(single).toHaveLength(1);
		expect(single[0].view).toBe(wide[0].view);
	});

	it("gives every pane a distinct id", () => {
		for (const preset of layoutPresets) {
			const panes = applyLayout(preset.id as LayoutId);
			const ids = new Set(panes.map((pane) => pane.id));
			expect(ids.size).toBe(panes.length);
		}
	});
});

describe("grid placement", () => {
	it("places a single slot in its own cell", () => {
		expect(gridAreaOf(["a" as SlotId])).toEqual({
			rowStart: 1,
			rowEnd: 2,
			columnStart: 1,
			columnEnd: 2,
		});
	});

	it("spans a vertical pair down both rows", () => {
		expect(gridAreaOf(["a", "c"])).toEqual({
			rowStart: 1,
			rowEnd: 3,
			columnStart: 1,
			columnEnd: 2,
		});
	});

	it("spans a horizontal pair across both columns", () => {
		expect(gridAreaOf(["a", "b"])).toEqual({
			rowStart: 1,
			rowEnd: 2,
			columnStart: 1,
			columnEnd: 3,
		});
	});
});

describe("default workspace", () => {
	it("opens with the grid beside the Markdown source", () => {
		const workspace = createDefaultWorkspace();
		expect(workspace.layout).toBe("columns");
		expect(workspace.panes.map((pane) => pane.view)).toEqual([
			"grid",
			"markdown",
		]);
		expect(workspace.activePaneId).toBe(workspace.panes[0].id);
	});
});
