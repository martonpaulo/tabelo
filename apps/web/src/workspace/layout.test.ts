import { describe, expect, it } from "vitest";
import {
	applyLayout,
	createDefaultWorkspace,
	getLayout,
	gridAreaOf,
	type LayoutId,
	layoutPresets,
	layoutSplitsColumns,
	layoutSplitsRows,
	layoutsForPaneCount,
	movePane,
	movePaneDestinations,
	paneCount,
	panePositionId,
	SLOT_ORDER,
	type SlotId,
	smallerLayout,
	splitOptions,
	type Workspace,
	type WorkspacePane,
	workspacePanesTileLayout,
} from "./layout";

// The invariant that makes the workspace safe: every preset tiles the 2x2 grid
// exactly once. A preset that leaves a hole or overlaps would render panes on
// top of each other.

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture value.");
	return value;
}

describe("layout presets", () => {
	it("contains only layouts with one to four panes", () => {
		expect(layoutPresets).toHaveLength(8);
		expect(layoutPresets.map((preset) => preset.id)).toContain("single");
		expect(
			layoutPresets.every(
				(preset) => preset.panes.length >= 1 && preset.panes.length <= 4,
			),
		).toBe(true);
	});

	it("falls back to the named default layout", () => {
		expect(getLayout("unknown" as LayoutId).id).toBe("columns");
	});

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
		expect(layoutSplitsColumns("columns")).toBe(true);
		expect(layoutSplitsRows("columns")).toBe(false);
		expect(layoutSplitsColumns("rows")).toBe(false);
		expect(layoutSplitsRows("rows")).toBe(true);
		expect(layoutSplitsColumns("quad")).toBe(true);
		expect(layoutSplitsRows("quad")).toBe(true);
		// One pane spans both axes whole, so neither resize handle means
		// anything and neither is rendered.
		expect(layoutSplitsColumns("single")).toBe(false);
		expect(layoutSplitsRows("single")).toBe(false);
	});
});

describe("layouts for a pane count", () => {
	it("offers only the arrangements of that many panes", () => {
		expect(layoutsForPaneCount(1).map((preset) => preset.id)).toEqual([
			"single",
		]);
		expect(layoutsForPaneCount(2).map((preset) => preset.id)).toEqual([
			"columns",
			"rows",
		]);
		expect(layoutsForPaneCount(3).map((preset) => preset.id)).toEqual([
			"left-split",
			"right-split",
			"top-split",
			"bottom-split",
		]);
		expect(layoutsForPaneCount(4).map((preset) => preset.id)).toEqual(["quad"]);
	});

	it("partitions every preset across the supported counts", () => {
		const partitioned = [1, 2, 3, 4].flatMap((count) =>
			layoutsForPaneCount(count).map((preset) => preset.id),
		);
		expect([...partitioned].sort()).toEqual(
			layoutPresets.map((preset) => preset.id).sort(),
		);
	});

	it("offers nothing for a count no preset represents", () => {
		expect(layoutsForPaneCount(0)).toEqual([]);
		expect(layoutsForPaneCount(5)).toEqual([]);
		expect(layoutsForPaneCount(-1)).toEqual([]);
	});

	it("offers a choice only where more than one arrangement exists", () => {
		// One and four panes tile the grid one way each, which is what leaves the
		// Layout command disabled there rather than opening an empty dialog.
		expect(layoutsForPaneCount(1)).toHaveLength(1);
		expect(layoutsForPaneCount(4)).toHaveLength(1);
		expect(layoutsForPaneCount(2).length).toBeGreaterThan(1);
		expect(layoutsForPaneCount(3).length).toBeGreaterThan(1);
	});

	it.each([1, 2, 3, 4])("agrees with paneCount for %i panes", (count) => {
		for (const preset of layoutsForPaneCount(count)) {
			expect(paneCount(preset.id)).toBe(count);
		}
	});
});

describe("applying a layout", () => {
	it("carries existing views across in reading order", () => {
		const before = applyLayout("columns");
		const chosen = [
			{ ...required(before[0]), view: "csv" as const },
			{ ...required(before[1]), view: "jira" as const },
		];
		const after = applyLayout("quad", chosen);

		expect(after).toHaveLength(4);
		expect(required(after[0]).view).toBe("csv");
		expect(required(after[1]).view).toBe("jira");
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

		const after = applyLayout("columns", before, preferred?.id);

		// The preferred pane replaces the last carried one, and it has to arrive
		// whole: the same pane still showing the same view.
		expect(after).toHaveLength(2);
		expect(after.at(-1)?.id).toBe(preferred?.id);
		expect(after.at(-1)?.view).toBe(preferred?.view);
	});

	it("fills panes a smaller layout did not have", () => {
		const after = applyLayout("quad", [
			{
				id: "abcd",
				view: "grid",
				slots: ["a", "b", "c", "d"],
				zoom: 1,
				wrap: false,
			},
		]);
		expect(after).toHaveLength(4);
		expect(required(after[0]).view).toBe("grid");
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

	it("keeps the grid when collapsing to two panes", () => {
		const wide = applyLayout("quad");
		const columns = applyLayout("columns", wide);
		expect(columns).toHaveLength(2);
		expect(required(columns[0]).view).toBe(required(wide[0]).view);
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

function workspaceFor(id: LayoutId): Workspace {
	const panes = applyLayout(id);
	return {
		layout: id,
		panes,
		wrappedColumns: [],
		columnWidths: {},
		columnRatio: 0.5,
		rowRatio: 0.5,
		activePaneId: required(panes[0]).id,
	};
}

describe("pane count transitions", () => {
	it.each(layoutIds)("splits from %s grow by exactly one pane", (id) => {
		const options = splitOptions(workspaceFor(id));
		if (paneCount(id) === 4) {
			expect(options).toEqual([]);
			return;
		}
		expect(options.length).toBeGreaterThan(0);
		for (const option of options) {
			expect(paneCount(option.layout)).toBe(paneCount(id) + 1);
		}
	});

	// The mapping the issue confirmed, asserted as a whole rather than derived
	// again here: a test that recomputes the implementation proves nothing.
	it.each([
		["single", ["columns", "rows"]],
		["columns", ["left-split", "right-split"]],
		["rows", ["top-split", "bottom-split"]],
		["left-split", ["quad"]],
		["right-split", ["quad"]],
		["top-split", ["quad"]],
		["bottom-split", ["quad"]],
		["quad", []],
	] as const)("%s offers exactly the splits %s", (id, expected) => {
		expect(
			splitOptions(workspaceFor(id)).map((option) => option.layout),
		).toEqual(expected);
	});

	// One option per axis the pane spans whole: none for a single slot, one for
	// a two-slot pane, and two for the pane that owns the entire grid.
	it("offers one split per axis a pane spans whole", () => {
		for (const id of layoutIds) {
			const workspace = workspaceFor(id);
			const expected = workspace.panes.flatMap((pane) => {
				const area = gridAreaOf(pane.slots);
				const spans =
					Number(area.columnEnd - area.columnStart === 2) +
					Number(area.rowEnd - area.rowStart === 2);
				return Array.from({ length: spans }, () => pane.id);
			});
			const options = splitOptions(workspace);
			expect(options.map((option) => option.paneId).sort()).toEqual(
				[...expected].sort(),
			);
		}
	});

	it("names an edge only across an axis the pane spans whole", () => {
		for (const id of layoutIds) {
			const workspace = workspaceFor(id);
			for (const option of splitOptions(workspace)) {
				const pane = workspace.panes.find(
					(candidate) => candidate.id === option.paneId,
				) as WorkspacePane;
				const area = gridAreaOf(pane.slots);
				const span =
					option.edge === "bottom"
						? area.rowEnd - area.rowStart
						: area.columnEnd - area.columnStart;
				expect(span).toBe(2);
			}
		}
	});

	// The edge is a promise about where the pane will turn up, so it has to
	// agree with where applyLayout actually puts it.
	it("puts the new pane on the side its edge names", () => {
		for (const id of layoutIds) {
			const workspace = workspaceFor(id);
			for (const option of splitOptions(workspace)) {
				const before = workspace.panes;
				const after = applyLayout(option.layout, before);
				const existing = new Set(before.map((pane) => pane.id));
				const added = after.find((pane) => !existing.has(pane.id));
				const kept = after.find((pane) => pane.id === option.paneId);
				expect(added).toBeDefined();
				expect(kept).toBeDefined();

				const addedArea = gridAreaOf((added as WorkspacePane).slots);
				const keptArea = gridAreaOf((kept as WorkspacePane).slots);
				if (option.edge === "bottom") {
					expect(addedArea.rowStart).toBe(keptArea.rowEnd);
					expect(addedArea.columnStart).toBe(keptArea.columnStart);
				} else {
					expect(addedArea.columnStart).toBe(keptArea.columnEnd);
					expect(addedArea.rowStart).toBe(keptArea.rowStart);
				}
			}
		}
	});

	// Every control sits on an outer edge of the workspace, which is what makes
	// the pane being split unambiguous without a label on the divider.
	it("never places a control on a divider between two panes", () => {
		for (const id of layoutIds) {
			const workspace = workspaceFor(id);
			for (const option of splitOptions(workspace)) {
				const pane = workspace.panes.find(
					(candidate) => candidate.id === option.paneId,
				) as WorkspacePane;
				const area = gridAreaOf(pane.slots);
				// The 2x2 grid ends at line 3 on both axes.
				expect(option.edge === "bottom" ? area.rowEnd : area.columnEnd).toBe(3);
			}
		}
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
		// Annotated because the loop below reassigns it from its own successor.
		let id: LayoutId = "single" as LayoutId;
		counts.push(paneCount(id));
		for (let step = 0; step < 3; step += 1) {
			const next = required(splitOptions(workspaceFor(id))[0]);
			id = next.layout;
			counts.push(paneCount(id));
		}
		expect(counts).toEqual([1, 2, 3, 4]);

		while (smallerLayout(id)) {
			id = smallerLayout(id) as LayoutId;
			counts.push(paneCount(id));
		}
		expect(counts).toEqual([1, 2, 3, 4, 3, 2, 1]);
	});

	it("keeps the one-pane preset at the floor", () => {
		expect(smallerLayout("single")).toBeUndefined();
		// Both two-pane presets now have somewhere to go: either divider
		// disappearing leaves the same whole-grid shape.
		expect(smallerLayout("columns")).toBe("single");
		expect(smallerLayout("rows")).toBe("single");
	});

	it.each(["single", "columns", "rows", "left-split"] as const)(
		"closes back to %s after expanding it",
		(id) => {
			const larger = required(splitOptions(workspaceFor(id))[0]);
			expect(smallerLayout(larger.layout)).toBe(id);
		},
	);

	it("closes a top split back to rows", () => {
		expect(smallerLayout("top-split")).toBe("rows");
	});

	it("shrinks without losing a surviving pane or moving one it can keep", () => {
		for (const id of layoutIds) {
			const target = smallerLayout(id);
			if (!target) continue;
			const before = applyLayout(id);
			// Closing the last pane is the case where nothing else has to move.
			const survivors = before.slice(0, -1);
			const after = applyLayout(target, survivors);

			expect([...after].map((pane) => pane.id).sort()).toEqual(
				[...survivors].map((pane) => pane.id).sort(),
			);

			// A survivor stays in its corner whenever the smaller preset still has
			// a position starting there. Only "top-split" drops a corner it was
			// using, so only its pane in slot b is allowed to move.
			const keptCorners = new Set(applyLayout(target).map(cornerOf));
			for (const pane of survivors) {
				if (!keptCorners.has(cornerOf(pane))) continue;
				const moved = after.find((candidate) => candidate.id === pane.id);
				expect(moved).toBeDefined();
				expect(cornerOf(moved as WorkspacePane)).toBe(cornerOf(pane));
			}
		}
	});

	it("moves only the corner a top split cannot keep when it shrinks", () => {
		const before = applyLayout("top-split");
		const after = applyLayout("rows", before.slice(0, -1));
		const beforeFirst = required(before[0]);
		const beforeSecond = required(before[1]);
		const afterFirst = required(after[0]);
		const afterSecond = required(after[1]);

		expect(after.map((pane) => pane.id)).toEqual([
			beforeFirst.id,
			beforeSecond.id,
		]);
		expect(cornerOf(afterFirst)).toBe(cornerOf(beforeFirst));
		expect(cornerOf(afterSecond)).not.toBe(cornerOf(beforeSecond));
	});

	it("adds the new pane where no surviving pane already sits", () => {
		for (const id of layoutIds) {
			for (const option of splitOptions(workspaceFor(id))) {
				const target = option.layout;
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
		}
	});

	it("keeps every other pane in place when one in the middle is closed", () => {
		// Top-right closes, so the pane below it takes the freed column and the
		// two on the left do not move at all.
		const views = ["grid", "markdown", "csv", "jira"] as const;
		const before = applyLayout("quad").map((pane, index) => ({
			...pane,
			view: required(views[index]),
		}));
		const first = required(before[0]);
		const second = required(before[1]);
		const third = required(before[2]);
		const fourth = required(before[3]);
		const after = applyLayout(
			smallerLayout("quad") as LayoutId,
			before.filter((pane) => pane.id !== second.id),
		);

		expect(after.map((pane) => pane.view).sort()).toEqual([
			"csv",
			"grid",
			"jira",
		]);
		expect(after.some((pane) => pane.id === second.id)).toBe(false);

		const placed = new Map(after.map((pane) => [pane.id, cornerOf(pane)]));
		expect(placed.get(first.id)).toBe(cornerOf(first));
		expect(placed.get(third.id)).toBe(cornerOf(third));
		// The survivor that grows keeps the slot it already occupied inside its
		// larger shape, rather than being shuffled to a different corner.
		expect(
			after
				.find((pane) => pane.id === fourth.id)
				?.slots.includes(required(fourth.slots[0])),
		).toBe(true);
	});
});

describe("moving panes", () => {
	it.each(layoutIds)("offers every other occupied position in %s", (id) => {
		const workspace = workspaceFor(id);
		for (const pane of workspace.panes) {
			const destinations = movePaneDestinations(workspace, pane.id);
			expect(destinations).toHaveLength(workspace.panes.length - 1);
			expect(destinations.map((destination) => destination.paneId)).toEqual(
				workspace.panes
					.filter((candidate) => candidate.id !== pane.id)
					.map((candidate) => candidate.id),
			);
		}
	});

	it.each([
		[["a", "b", "c", "d"], "full"],
		[["a", "b"], "top-full-width"],
		[["c", "d"], "bottom-full-width"],
		[["a", "c"], "left-full-height"],
		[["b", "d"], "right-full-height"],
		[["a"], "top-left"],
		[["b"], "top-right"],
		[["c"], "bottom-left"],
		[["d"], "bottom-right"],
	] as const)("names %s as %s", (slots, expected) => {
		expect(panePositionId(slots)).toBe(expected);
	});

	it.each(layoutIds)("swaps every valid pane pair in %s", (id) => {
		const workspace = workspaceFor(id);
		for (const source of workspace.panes) {
			for (const destination of workspace.panes) {
				if (source.id === destination.id) continue;
				const moved = movePane(workspace, source.id, destination.id);
				expect(moved).not.toBeNull();
				if (!moved) continue;

				expect(workspacePanesTileLayout(moved.layout, moved.panes)).toBe(true);
				expect(moved.activePaneId).toBe(source.id);
				expect(moved.panes.map((pane) => pane.slots)).toEqual(
					workspace.panes.map((pane) => pane.slots),
				);
				expect(moved.panes.find((pane) => pane.id === source.id)?.slots).toBe(
					destination.slots,
				);
				expect(
					moved.panes.find((pane) => pane.id === destination.id)?.slots,
				).toBe(source.slots);
				for (const pane of moved.panes) {
					const original = workspace.panes.find(
						(candidate) => candidate.id === pane.id,
					);
					expect(pane).toMatchObject({
						id: original?.id,
						view: original?.view,
						zoom: original?.zoom,
						wrap: original?.wrap,
					});
				}
			}
		}
	});

	it("refuses missing, same, and invalid destinations", () => {
		const workspace = workspaceFor("columns");
		const source = required(workspace.panes[0]).id;
		const destination = required(workspace.panes[1]).id;
		expect(movePane(workspace, source, source)).toBeNull();
		expect(movePane(workspace, source, "missing")).toBeNull();
		expect(movePane(workspace, "missing", destination)).toBeNull();
		expect(
			movePane(
				{
					...workspace,
					panes: workspace.panes.map((pane) => ({ ...pane, slots: ["a"] })),
				},
				source,
				destination,
			),
		).toBeNull();
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
		expect(workspace.activePaneId).toBe(required(workspace.panes[0]).id);
	});
});
