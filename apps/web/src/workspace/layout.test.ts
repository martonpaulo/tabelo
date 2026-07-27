import { describe, expect, it } from "vitest";
import {
	applyLayout,
	createDefaultWorkspace,
	gridAreaOf,
	type LayoutId,
	largerLayout,
	layoutPresets,
	layoutSplitsColumns,
	layoutSplitsRows,
	paneCount,
	SLOT_ORDER,
	type SlotId,
	smallerLayout,
	type WorkspacePane,
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

	it("keeps carried pane identifiers stable across shape changes", () => {
		const before = applyLayout("columns");
		const after = applyLayout("quad", before);

		expect(after.slice(0, before.length).map((pane) => pane.id)).toEqual(
			before.map((pane) => pane.id),
		);
	});

	it("keeps a preferred pane when a smaller layout cannot carry every pane", () => {
		const before = applyLayout("quad");
		const preferred = before.at(-1);
		expect(preferred).toBeDefined();

		const after = applyLayout("single", before, preferred?.id);

		expect(after[0].id).toBe(preferred?.id);
		expect(after[0].view).toBe(preferred?.view);
	});

	it("fills panes a smaller layout did not have", () => {
		const after = applyLayout("quad", [
			{ id: "abcd", view: "grid", slots: ["a", "b", "c", "d"], zoom: 1 },
		]);
		expect(after).toHaveLength(4);
		expect(after[0].view).toBe("grid");
		expect(after.every((pane) => pane.view.length > 0)).toBe(true);
	});

	it("fills a new pane with a view the workspace is not already showing", () => {
		const before = applyLayout("columns").map((pane) => ({
			...pane,
			view: "csv" as const,
		}));

		const after = applyLayout("quad", before);

		const added = after.filter(
			(pane) => !before.some((candidate) => candidate.id === pane.id),
		);
		expect(added).toHaveLength(2);
		expect(added.map((pane) => pane.view)).not.toContain("csv");
		expect(new Set(added.map((pane) => pane.view)).size).toBe(added.length);
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

// Add view and Close view are expressed as moves between presets, so the
// invariants that make the gallery safe have to hold for them too: one pane at
// a time, every count reachable, and nothing invented outside the preset list.

const layoutIds = layoutPresets.map((preset) => preset.id);

function cornerOf(pane: WorkspacePane): string {
	const area = gridAreaOf(pane.slots);
	return `${area.rowStart}:${area.columnStart}`;
}

describe("pane count transitions", () => {
	it.each(layoutIds)("grows from %s by exactly one pane", (id) => {
		const target = largerLayout(id);
		if (paneCount(id) === 4) {
			expect(target).toBeUndefined();
			return;
		}
		expect(target).toBeDefined();
		expect(paneCount(target as LayoutId)).toBe(paneCount(id) + 1);
	});

	it.each(layoutIds)("shrinks from %s by exactly one pane", (id) => {
		const target = smallerLayout(id);
		if (paneCount(id) === 1) {
			expect(target).toBeUndefined();
			return;
		}
		expect(target).toBeDefined();
		expect(paneCount(target as LayoutId)).toBe(paneCount(id) - 1);
	});

	it("reaches every pane count from one to four and back", () => {
		const counts: number[] = [];
		let id: LayoutId = "single";
		counts.push(paneCount(id));
		for (let step = 0; step < 3; step += 1) {
			const next = largerLayout(id);
			expect(next).toBeDefined();
			id = next as LayoutId;
			counts.push(paneCount(id));
		}
		expect(counts).toEqual([1, 2, 3, 4]);

		while (smallerLayout(id)) {
			id = smallerLayout(id) as LayoutId;
			counts.push(paneCount(id));
		}
		expect(counts).toEqual([1, 2, 3, 4, 3, 2, 1]);
	});

	it("shrinks without moving any pane that survives", () => {
		for (const id of layoutIds) {
			const target = smallerLayout(id);
			if (!target) continue;
			const before = applyLayout(id);
			// Closing the last pane is the case where nothing else has to move.
			const after = applyLayout(target, before.slice(0, -1));

			for (const pane of after) {
				const original = before.find((candidate) => candidate.id === pane.id);
				expect(original).toBeDefined();
				expect(cornerOf(pane)).toBe(cornerOf(original as WorkspacePane));
			}
		}
	});

	it("adds the new pane where no surviving pane already sits", () => {
		for (const id of layoutIds) {
			const target = largerLayout(id);
			if (!target) continue;
			const before = applyLayout(id);
			const after = applyLayout(target, before);

			const carried = after.filter((pane) =>
				before.some((candidate) => candidate.id === pane.id),
			);
			expect(carried).toHaveLength(before.length);
			for (const pane of carried) {
				const original = before.find((candidate) => candidate.id === pane.id);
				expect(cornerOf(pane)).toBe(cornerOf(original as WorkspacePane));
			}
			expect(after).toHaveLength(before.length + 1);
		}
	});

	it("keeps every other pane in place when one in the middle is closed", () => {
		// Top-right closes, so the pane below it takes the freed column and the
		// two on the left do not move at all.
		const before = applyLayout("quad").map((pane, index) => ({
			...pane,
			view: (["grid", "markdown", "csv", "jira"] as const)[index],
		}));
		const after = applyLayout(
			smallerLayout("quad") as LayoutId,
			before.filter((pane) => pane.id !== before[1].id),
		);

		expect(after.map((pane) => pane.view).sort()).toEqual([
			"csv",
			"grid",
			"jira",
		]);
		expect(after.some((pane) => pane.id === before[1].id)).toBe(false);

		const placed = new Map(after.map((pane) => [pane.id, cornerOf(pane)]));
		expect(placed.get(before[0].id)).toBe(cornerOf(before[0]));
		expect(placed.get(before[2].id)).toBe(cornerOf(before[2]));
		// The survivor that grows keeps the slot it already occupied inside its
		// larger shape, rather than being shuffled to a different corner.
		expect(
			after
				.find((pane) => pane.id === before[3].id)
				?.slots.includes(before[3].slots[0]),
		).toBe(true);
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
