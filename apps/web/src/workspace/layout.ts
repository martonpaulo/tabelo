import type { ViewId } from "@/views/types";
import { DEFAULT_PANE_ZOOM } from "./zoom";

// The workspace is a 2x2 grid of slots:
//
//   a | b
//   --+--
//   c | d
//
// A pane occupies one slot, two adjacent slots, or the whole grid, and a
// workspace holds one to four of them. Free-form slot assignment was
// deliberately not built: presets keep the choice to one obvious picker instead
// of a layout editor, which is the difference between a utility and an IDE.

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
	// Pane shapes in reading order, each a set of adjacent slots.
	readonly panes: readonly (readonly SlotId[])[];
}

// The layout every unknown id falls back to, named rather than indexed so that
// adding or removing a preset cannot silently change the fallback.
const DEFAULT_LAYOUT: LayoutPreset = {
	id: "columns",
	panes: [
		["a", "c"],
		["b", "d"],
	],
};

export const layoutPresets: readonly LayoutPreset[] = [
	// One pane is a preset spanning all four slots rather than the absence of a
	// preset, so splitting, shrinking, and the persisted schema all keep working
	// from the shapes a layout declares instead of gaining a pane-count branch.
	{
		id: "single",
		panes: [["a", "b", "c", "d"]],
	},
	DEFAULT_LAYOUT,
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

// The missing entry for "single" is the floor: a workspace always shows at
// least one view, so Close view has nowhere to go there and stays disabled.
// Both two-pane presets shrink to it, because either divider disappearing
// leaves the same whole-grid shape.
const SMALLER_LAYOUT: Partial<Record<LayoutId, LayoutId>> = {
	columns: "single",
	rows: "single",
	"left-split": "columns",
	"right-split": "columns",
	// A top split keeps its horizontal divider on the way down, so it shrinks to
	// rows rather than to columns. That costs the corner of the pane in slot b,
	// which is the one place shrinking has to move a survivor.
	"top-split": "rows",
	"bottom-split": "rows",
	quad: "left-split",
};

// Undefined at the ends of the range, which is what disables the action rather
// than hiding it.
export function smallerLayout(id: LayoutId): LayoutId | undefined {
	return SMALLER_LAYOUT[id];
}

export interface WorkspacePane {
	readonly id: string;
	readonly view: ViewId;
	readonly slots: readonly SlotId[];
	// Local content scale. Presentation only: see workspace/zoom.ts.
	readonly zoom: number;
	// Source soft wrapping belongs to the pane, not the format or document. A
	// non-source view carries the dormant preference so changing the view back
	// restores the pane exactly as the user left it.
	readonly wrap: boolean;
}

// Which edge of a pane carries its split control, and therefore which side the
// pane it creates appears on. A pane is cut across each axis it spans two
// tracks on, so a tall one gains a pane below, a wide one gains a pane beside
// it, and the whole-grid pane of "single" offers both. Every such edge is an
// outer edge of the workspace: no control ever sits on the divider between two
// panes, so there is never a question of which is splitting.
export type SplitEdge = "bottom" | "right";

export interface SplitOption {
	readonly paneId: string;
	readonly edge: SplitEdge;
	readonly layout: LayoutId;
}

export interface Workspace {
	readonly layout: LayoutId;
	readonly panes: readonly WorkspacePane[];
	// Grid presentation keyed by stable column id. It follows the workspace
	// rather than the document timeline, codecs, or clipboard projections.
	readonly wrappedColumns: readonly string[];
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
			wrap: existing?.wrap ?? false,
		};
	});
}

// A layout identified by the shapes it holds rather than by its name, so two
// presets can be compared without either being named here.
function shapeSignature(panes: readonly (readonly SlotId[])[]): string {
	return panes
		.map((slots) => [...slots].sort().join(""))
		.sort()
		.join("|");
}

interface Halving {
	readonly edge: SplitEdge;
	readonly halves: readonly (readonly SlotId[])[];
}

// The two halves a cut along one axis produces. The grid is 2x2, so a track
// number is only ever 1 or 2 and the split is a partition on that value.
function halfAlong(
	slots: readonly SlotId[],
	axis: "row" | "column",
): readonly (readonly SlotId[])[] {
	return [
		slots.filter((slot) => SLOT_POSITION[slot][axis] === 1),
		slots.filter((slot) => SLOT_POSITION[slot][axis] === 2),
	];
}

// Every way a pane can be cut into two equal rectangles. A pane spanning two
// columns can be cut down the middle, which puts the new pane to its right; one
// spanning two rows can be cut across, which puts it below. Only the whole-grid
// pane spans both, so it is the only pane offering a choice of direction, and a
// pane already down to one slot has nothing to give.
function halvings(slots: readonly SlotId[]): readonly Halving[] {
	const area = gridAreaOf(slots);
	const options: Halving[] = [];
	if (area.columnEnd - area.columnStart === 2) {
		options.push({ edge: "right", halves: halfAlong(slots, "column") });
	}
	if (area.rowEnd - area.rowStart === 2) {
		options.push({ edge: "bottom", halves: halfAlong(slots, "row") });
	}
	return options;
}

// Where the workspace can grow from here, one option per way a pane can be cut
// in half. Derived rather than tabulated: halving a pane means replacing its
// shape with the two halves, and the target preset is whichever one holds the
// shapes that leaves. A preset gains an entry the moment it exists.
//
// This replaced a single target per layout. Two columns reaches both Split left
// and Split right, depending on which of its two panes is the one being cut, so
// one answer per layout could not express it.
export function splitOptions(workspace: Workspace): readonly SplitOption[] {
	return workspace.panes.flatMap<SplitOption>((pane) =>
		halvings(pane.slots).flatMap<SplitOption>(({ edge, halves }) => {
			const shapes = workspace.panes.flatMap((candidate) =>
				candidate.id === pane.id ? halves : [candidate.slots],
			);
			const target = layoutPresets.find(
				(preset) => shapeSignature(preset.panes) === shapeSignature(shapes),
			);
			return target ? [{ paneId: pane.id, edge, layout: target.id }] : [];
		}),
	);
}

export function createDefaultWorkspace(): Workspace {
	const panes = applyLayout("columns");
	return {
		layout: "columns",
		panes,
		wrappedColumns: [],
		columnRatio: 0.5,
		rowRatio: 0.5,
		activePaneId: panes[0].id,
	};
}
