import type { ViewId } from "@/views/types";
import { DEFAULT_PANE_ZOOM } from "./zoom";

// The workspace is a 2x2 grid of slots:
//
//   a | b
//   --+--
//   c | d
//
// A pane occupies one slot or two adjacent slots. Free-form slot assignment
// was deliberately not built: presets keep
// the choice to one obvious picker instead of a layout editor, which is the
// difference between a utility and an IDE.

export type SlotId = "a" | "b" | "c" | "d";

export const SLOT_ORDER: readonly SlotId[] = ["a", "b", "c", "d"];

export type LayoutId =
	| "columns"
	| "rows"
	| "left-split"
	| "right-split"
	| "top-split"
	| "bottom-split"
	| "quad";

export interface LayoutPreset {
	readonly id: LayoutId;
	// Pane shapes in reading order, each a set of adjacent slots.
	readonly panes: readonly (readonly SlotId[])[];
}

export const layoutPresets: readonly LayoutPreset[] = [
	{
		id: "columns",
		panes: [
			["a", "c"],
			["b", "d"],
		],
	},
	{
		id: "rows",
		panes: [
			["a", "b"],
			["c", "d"],
		],
	},
	{
		id: "left-split",
		panes: [["a"], ["b", "d"], ["c"]],
	},
	{
		id: "right-split",
		panes: [["a", "c"], ["b"], ["d"]],
	},
	{
		id: "top-split",
		panes: [["a"], ["b"], ["c", "d"]],
	},
	{
		id: "bottom-split",
		panes: [["a", "b"], ["c"], ["d"]],
	},
	{
		id: "quad",
		panes: [["a"], ["b"], ["c"], ["d"]],
	},
];

const DEFAULT_LAYOUT = layoutPresets.find((preset) => preset.id === "columns");
if (!DEFAULT_LAYOUT)
	throw new Error("The default workspace layout is missing.");

export function getLayout(id: LayoutId): LayoutPreset {
	return layoutPresets.find((preset) => preset.id === id) ?? DEFAULT_LAYOUT;
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

export function paneCount(id: LayoutId): number {
	return getLayout(id).panes.length;
}

// Adding and closing a view are moves between the same presets the gallery
// offers, so the workspace has one transition model rather than two: a direct
// action can never reach a shape the picker cannot. Each target is the preset
// that leaves the most surviving panes in the slot they already started in,
// which is what makes the change read as local rather than as a re-tiling.
const LARGER_LAYOUT: Partial<Record<LayoutId, LayoutId>> = {
	columns: "left-split",
	rows: "bottom-split",
	"left-split": "quad",
	"right-split": "quad",
	"top-split": "quad",
	"bottom-split": "quad",
};

const SMALLER_LAYOUT: Partial<Record<LayoutId, LayoutId>> = {
	"left-split": "columns",
	"right-split": "columns",
	"top-split": "rows",
	"bottom-split": "rows",
	quad: "left-split",
};

// Undefined at the ends of the range, which is what disables the action rather
// than hiding it.
export function largerLayout(id: LayoutId): LayoutId | undefined {
	return LARGER_LAYOUT[id];
}

export function smallerLayout(id: LayoutId): LayoutId | undefined {
	return SMALLER_LAYOUT[id];
}

export interface WorkspacePane {
	readonly id: string;
	readonly view: ViewId;
	readonly slots: readonly SlotId[];
	// Local content scale. Presentation only: see workspace/zoom.ts.
	readonly zoom: number;
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

function nextPaneId(used: Set<string>): string {
	let index = 1;
	while (used.has(`pane-${index}`)) index += 1;
	const id = `pane-${index}`;
	used.add(id);
	return id;
}

// A pane's top-left slot. Every pane is a rectangle, so this identifies its
// position uniquely within a layout and is what makes a pane recognisable as
// "the same one" after the shape around it changes.
function cornerOf(slots: readonly SlotId[]): string {
	const area = gridAreaOf(slots);
	return `${area.rowStart}:${area.columnStart}`;
}

// Rebuilds the pane list for a layout while keeping pane identity independent
// from shape and position. Each position of the new layout first claims the
// pane that already starts in its top-left slot, so a shape change moves as few
// panes as it can; whatever is left fills the remaining positions in reading
// order. When fewer panes fit, the preferred pane replaces the last carried
// pane so an owned draft remains mounted and reachable.
export function applyLayout(
	layoutId: LayoutId,
	previousPanes: readonly WorkspacePane[] = [],
	preferredPaneId?: string,
): WorkspacePane[] {
	const preset = getLayout(layoutId);
	const count = preset.panes.length;

	const claimed = new Set<string>();
	const carried: (WorkspacePane | undefined)[] = preset.panes.map((slots) => {
		const corner = cornerOf(slots);
		const match = previousPanes.find(
			(pane) => !claimed.has(pane.id) && cornerOf(pane.slots) === corner,
		);
		if (match) claimed.add(match.id);
		return match;
	});

	const leftover = previousPanes.filter((pane) => !claimed.has(pane.id));
	for (let index = 0; index < count && leftover.length > 0; index += 1) {
		if (!carried[index]) carried[index] = leftover.shift();
	}

	const preferred = preferredPaneId
		? previousPanes.find((pane) => pane.id === preferredPaneId)
		: undefined;
	if (preferred && !carried.some((pane) => pane?.id === preferred.id)) {
		carried[count - 1] = preferred;
	}

	const used = new Set(previousPanes.map((pane) => pane.id));
	// A pane the workspace gains shows something it is not showing already,
	// which is the whole reason to have gained it.
	const shown = new Set(
		carried.filter((pane) => pane !== undefined).map((pane) => pane.view),
	);
	const nextView = (): ViewId => {
		const view = FILL_ORDER.find((candidate) => !shown.has(candidate));
		shown.add(view ?? "markdown");
		return view ?? "markdown";
	};

	return preset.panes.map((slots, index) => {
		const existing = carried[index];
		return {
			id: existing?.id ?? nextPaneId(used),
			view: existing?.view ?? nextView(),
			slots,
			zoom: existing?.zoom ?? DEFAULT_PANE_ZOOM,
		};
	});
}

export function createDefaultWorkspace(): Workspace {
	const panes = applyLayout("columns");
	return {
		layout: "columns",
		panes,
		columnRatio: 0.5,
		rowRatio: 0.5,
		activePaneId: panes[0].id,
	};
}
