import type { ViewId } from "@/views/types";

// The workspace is a 2x2 grid of slots:
//
//   a | b
//   --+--
//   c | d
//
// A pane occupies one slot, two adjacent slots, or — as the "single" preset —
// all four. Free-form slot assignment was deliberately not built: presets keep
// the choice to one obvious picker instead of a layout editor, which is the
// difference between a utility and an IDE.

export type SlotId = "a" | "b" | "c" | "d";

export const SLOT_ORDER: readonly SlotId[] = ["a", "b", "c", "d"];

export type LayoutId =
	| "single"
	| "columns"
	| "rows"
	| "left-split"
	| "right-split"
	| "top-split"
	| "bottom-split"
	| "quad";

export interface LayoutPreset {
	readonly id: LayoutId;
	readonly label: string;
	readonly description: string;
	// Pane shapes in reading order, each a set of adjacent slots.
	readonly panes: readonly (readonly SlotId[])[];
}

export const layoutPresets: readonly LayoutPreset[] = [
	{
		id: "single",
		label: "Single",
		description: "One view, full width.",
		panes: [["a", "b", "c", "d"]],
	},
	{
		id: "columns",
		label: "Two columns",
		description: "Side by side.",
		panes: [
			["a", "c"],
			["b", "d"],
		],
	},
	{
		id: "rows",
		label: "Two rows",
		description: "Stacked.",
		panes: [
			["a", "b"],
			["c", "d"],
		],
	},
	{
		id: "left-split",
		label: "Split left",
		description: "Two stacked on the left, one tall on the right.",
		panes: [["a"], ["b", "d"], ["c"]],
	},
	{
		id: "right-split",
		label: "Split right",
		description: "One tall on the left, two stacked on the right.",
		panes: [["a", "c"], ["b"], ["d"]],
	},
	{
		id: "top-split",
		label: "Split top",
		description: "Two across the top, one wide below.",
		panes: [["a"], ["b"], ["c", "d"]],
	},
	{
		id: "bottom-split",
		label: "Split bottom",
		description: "One wide on top, two across the bottom.",
		panes: [["a", "b"], ["c"], ["d"]],
	},
	{
		id: "quad",
		label: "Four panes",
		description: "All four views at once.",
		panes: [["a"], ["b"], ["c"], ["d"]],
	},
];

export function getLayout(id: LayoutId): LayoutPreset {
	return layoutPresets.find((preset) => preset.id === id) ?? layoutPresets[1];
}

export interface GridArea {
	readonly rowStart: number;
	readonly rowEnd: number;
	readonly columnStart: number;
	readonly columnEnd: number;
}

const SLOT_POSITION: Record<SlotId, { row: number; column: number }> = {
	a: { row: 1, column: 1 },
	b: { row: 1, column: 2 },
	c: { row: 2, column: 1 },
	d: { row: 2, column: 2 },
};

// Turns a set of slots into CSS grid line numbers. Because every shape is a
// rectangle, the bounding box is the placement.
export function gridAreaOf(slots: readonly SlotId[]): GridArea {
	const positions = slots.map((slot) => SLOT_POSITION[slot]);
	const rows = positions.map((position) => position.row);
	const columns = positions.map((position) => position.column);
	return {
		rowStart: Math.min(...rows),
		rowEnd: Math.max(...rows) + 1,
		columnStart: Math.min(...columns),
		columnEnd: Math.max(...columns) + 1,
	};
}

export function gridAreaStyle(slots: readonly SlotId[]): string {
	const area = gridAreaOf(slots);
	return `${area.rowStart} / ${area.columnStart} / ${area.rowEnd} / ${area.columnEnd}`;
}

// Whether a layout actually splits along an axis, which decides if the matching
// resize handle means anything. Derived from the preset rather than listed, so
// a new preset needs no edit here: an axis is split as soon as some pane
// occupies a single track along it.
export function layoutSplitsColumns(id: LayoutId): boolean {
	return getLayout(id).panes.some((slots) => {
		const area = gridAreaOf(slots);
		return area.columnEnd - area.columnStart === 1;
	});
}

export function layoutSplitsRows(id: LayoutId): boolean {
	return getLayout(id).panes.some((slots) => {
		const area = gridAreaOf(slots);
		return area.rowEnd - area.rowStart === 1;
	});
}

export interface WorkspacePane {
	readonly id: string;
	readonly view: ViewId;
	readonly slots: readonly SlotId[];
}

export interface Workspace {
	readonly layout: LayoutId;
	readonly panes: readonly WorkspacePane[];
	// Fractions of the workspace given to the first column and the first row.
	readonly columnRatio: number;
	readonly rowRatio: number;
	// The pane the user last interacted with, which is what document-level
	// actions and the keyboard apply to.
	readonly activePaneId: string;
}

// Views chosen for panes that a layout change newly created. The order is the
// product's opinion about what is most useful to see next to the table.
const FILL_ORDER: readonly ViewId[] = [
	"grid",
	"markdown",
	"csv",
	"html-preview",
];

export function paneIdFor(slots: readonly SlotId[]): string {
	return slots.join("");
}

// Rebuilds the pane list for a layout, carrying existing view choices across in
// reading order so switching layouts never resets what the user was looking at.
export function applyLayout(
	layoutId: LayoutId,
	previousPanes: readonly WorkspacePane[] = [],
): WorkspacePane[] {
	const preset = getLayout(layoutId);
	const carried = previousPanes.map((pane) => pane.view);

	return preset.panes.map((slots, index) => ({
		id: paneIdFor(slots),
		view: carried[index] ?? FILL_ORDER[index] ?? "markdown",
		slots,
	}));
}

export function createDefaultWorkspace(): Workspace {
	const panes = applyLayout("columns", [
		{ id: "ac", view: "grid", slots: ["a", "c"] },
		{ id: "bd", view: "markdown", slots: ["b", "d"] },
	]);
	return {
		layout: "columns",
		panes,
		columnRatio: 0.5,
		rowRatio: 0.5,
		activePaneId: panes[0].id,
	};
}
