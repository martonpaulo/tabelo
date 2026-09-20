import { type ReconciliationSource, reconcileDocument } from "@/core/document";
import type { GridSelection } from "@/core/selection";
import type { TableDocument } from "@/core/types";
import type { HistoryDirection } from "@/history/coordinator";
import type { Draft } from "@/sync/draft";
import type { Workspace } from "@/workspace/layout";

// The document timeline: every committed parse and every grid operation is one
// step, and a source editor's own history is layered on top of it
// (docs/adr/0003). Pure functions over plain state, so the store composes them
// and nothing here knows about React, the DOM, or the store itself.

// How many steps the document timeline keeps. Deep enough to cover a working
// session, bounded so a long session cannot grow without limit.
export const HISTORY_LIMIT = 200;

// The exact selections on either side of one document transition, for the
// operations that permute rows rather than editing in place. Undo restores
// `before` and redo restores `after`, so a sort comes back to precisely what
// was selected before it and returns to precisely what it left selected, even
// when the selection moved in between.
//
// Transient timeline metadata, not persisted sort state: it lives on the
// in-memory history entry, never reaches storage, and describes no order the
// document should be kept in. Every other operation carries none of it and
// keeps the clamping behaviour it always had.
export interface SelectionRestore {
	readonly before: GridSelection;
	readonly after: GridSelection;
}

export type ColumnPreferences = Pick<
	Workspace,
	"columnWidths" | "wrappedColumns"
>;

export interface HistoryEntry {
	readonly document: TableDocument;
	// A draft that was still uncommitted when this entry was superseded.
	// Restoring it is what keeps a grid edit from destroying pending text.
	readonly draft: Draft | null;
	// Present only on the entry adjacent to a row permutation. It travels with
	// the transition through undo and redo, so both directions restore an exact
	// selection rather than a clamped one.
	readonly selectionRestore?: SelectionRestore;
	// The column widths and wrapped columns as they were when this document was
	// left. Both are keyed by column id and dropped once no column carries the
	// id, so this is what lets undo and redo bring a returning column back at
	// the width and wrapping it had, whichever operation removed it (#235).
	// Transient like the selection pair: it shares the workspace's own objects
	// and never reaches storage.
	readonly columnPreferences: ColumnPreferences;
}

// The part of the application state the timeline reads: the present, and the
// entries on either side of it.
export interface TimelineState {
	readonly document: TableDocument;
	readonly draft: Draft | null;
	readonly workspace: ColumnPreferences;
	readonly past: readonly HistoryEntry[];
	readonly future: readonly HistoryEntry[];
}

export type Timeline = Pick<TimelineState, "past" | "future" | "document">;

// The present as a history entry. A draft still inside its grace period is
// recorded as visibly invalid: once it is restored, nothing is waiting to
// reveal the error any more.
export function snapshotOf(
	state: Pick<TimelineState, "document" | "draft" | "workspace">,
): HistoryEntry {
	const draft =
		state.draft?.status === "invalid-grace"
			? { ...state.draft, status: "invalid" as const }
			: state.draft;
	const { columnWidths, wrappedColumns } = state.workspace;
	return {
		document: state.document,
		draft,
		columnPreferences: { columnWidths, wrappedColumns },
	};
}

export function pushHistory(
	past: readonly HistoryEntry[],
	entry: HistoryEntry,
): readonly HistoryEntry[] {
	const next = [...past, entry];
	return next.length > HISTORY_LIMIT
		? next.slice(next.length - HISTORY_LIMIT)
		: next;
}

// The present recorded as one new step, clearing redo: what every edit does.
// A selection pair names the transition leaving the present.
export function recordStep(
	state: TimelineState,
	selectionRestore?: SelectionRestore,
): Pick<Timeline, "past" | "future"> {
	return {
		past: pushHistory(
			state.past,
			selectionRestore
				? { ...snapshotOf(state), selectionRestore }
				: snapshotOf(state),
		),
		future: [],
	};
}

// One step back or forward. The entry left behind carries the reached entry's
// selection pair, because the pair travels with the transition rather than
// with a document, so the opposite move finds it again on the other side.
export function stepTimeline(
	state: TimelineState,
	direction: HistoryDirection,
): {
	readonly timeline: Timeline;
	readonly target: HistoryEntry;
} | null {
	const target = direction === "undo" ? state.past.at(-1) : state.future[0];
	if (!target) return null;
	const restore = target.selectionRestore;
	const left = restore
		? { ...snapshotOf(state), selectionRestore: restore }
		: snapshotOf(state);
	return {
		timeline:
			direction === "undo"
				? {
						past: state.past.slice(0, -1),
						future: [left, ...state.future],
						document: target.document,
					}
				: {
						past: pushHistory(state.past, left),
						future: state.future.slice(1),
						document: target.document,
					},
		target,
	};
}

// What can be known about a match without building the reconciled document:
// `reconcileDocument` returns its first argument unchanged only when both
// counts agree, because that is what it starts its unchanged flags from and it
// only ever clears them. An entry of a different size can therefore be skipped
// with the same result, which is worth doing because the walk below would
// otherwise reconcile a whole document for every entry it crosses.
function sameShape(entry: TableDocument, document: TableDocument): boolean {
	return (
		entry.columns.length === document.columns.length &&
		entry.rows.length === document.rows.length
	);
}

// Where a source editor's own undo or redo lands in the document timeline.
// Every committed parse is one timeline step, so the text a local undo restores
// usually parses to a state the timeline already holds. Committing it as a new
// edit would add a step and clear redo, and the next undo, once local history
// is exhausted, would walk forward into the text just undone (docs/adr/0003).
//
// `entries` run nearest first: `past` reversed for undo, `future` for redo.
// The result is how many entries to cross to reach the matching state, or null
// when there is none. One local undo can span several committed keystrokes, so
// the walk may cross entries, but only states this same pane's draft produced:
// anything else, a grid operation or another pane's text, is a boundary the
// editor's history knows nothing about, and the change then stays an edit.
export function findTimelineStep(
	entries: readonly HistoryEntry[],
	document: TableDocument,
	reconciliation: ReconciliationSource,
	owner: Pick<Draft, "paneId" | "viewId">,
): number | null {
	for (const [index, entry] of entries.entries()) {
		if (entry.selectionRestore) return null;
		if (
			sameShape(entry.document, document) &&
			reconcileDocument(entry.document, document, reconciliation) ===
				entry.document
		) {
			return index;
		}
		const ownDraft =
			entry.draft?.paneId === owner.paneId &&
			entry.draft.viewId === owner.viewId;
		if (!ownDraft) return null;
	}
	return null;
}

// Moves across `steps` entries to the state `findTimelineStep` matched. The
// state being left and every entry crossed stay on the timeline, so redo, or
// undo again, walks back through each of them one step at a time.
export function walkTimeline(
	state: TimelineState,
	direction: HistoryDirection,
	steps: number,
): {
	readonly timeline: Timeline;
	readonly target: HistoryEntry;
} | null {
	if (direction === "undo") {
		const targetIndex = state.past.length - 1 - steps;
		const target = state.past[targetIndex];
		if (!target) return null;
		return {
			timeline: {
				past: state.past.slice(0, targetIndex),
				future: [
					...state.past.slice(targetIndex + 1),
					snapshotOf(state),
					...state.future,
				],
				document: target.document,
			},
			target,
		};
	}
	const target = state.future[steps];
	if (!target) return null;
	return {
		timeline: {
			past: [snapshotOf(state), ...state.future.slice(0, steps)].reduce(
				pushHistory,
				state.past,
			),
			future: state.future.slice(steps + 1),
			document: target.document,
		},
		target,
	};
}

// Where a committed parse lands. A change the editor's own undo or redo made
// walks to the matching timeline state when one exists (see
// `findTimelineStep`); any other change of the document, or a displaced
// invalid draft from another pane, is one new step. A parse that changed
// nothing and displaced nothing leaves the timeline as it is. A displaced
// invalid draft always gets its own step, so a local undo never walks past it
// and leaves it unrecoverable.
export function timelineForParse(
	state: TimelineState,
	document: TableDocument,
	parse: {
		readonly history: HistoryDirection | undefined;
		readonly reconciliation: ReconciliationSource;
		readonly owner: Pick<Draft, "paneId" | "viewId">;
		readonly displacesInvalid: boolean;
	},
): {
	readonly timeline: Pick<Timeline, "document"> &
		Partial<Pick<Timeline, "past" | "future">>;
	readonly target: HistoryEntry | null;
} {
	const { history, displacesInvalid } = parse;
	const documentChanged = document !== state.document;
	const step =
		history && documentChanged && !displacesInvalid
			? findTimelineStep(
					history === "undo" ? state.past.toReversed() : state.future,
					document,
					parse.reconciliation,
					parse.owner,
				)
			: null;
	const walk =
		history && step !== null ? walkTimeline(state, history, step) : null;
	if (walk) return walk;
	return {
		timeline:
			documentChanged || displacesInvalid
				? { ...recordStep(state), document }
				: { document },
		target: null,
	};
}

// Drops the width and wrapping of every column the document no longer holds.
// Returns the same workspace when nothing was dropped, so an unchanged
// document leaves state referentially identical.
export function reconcileColumnPreferences(
	workspace: Workspace,
	document: TableDocument,
): Workspace {
	const valid = new Set(document.columns.map((column) => column.id));
	const wrappedColumns = workspace.wrappedColumns.filter((id) => valid.has(id));
	const columnWidths = Object.fromEntries(
		Object.entries(workspace.columnWidths).filter(([id]) => valid.has(id)),
	);
	return wrappedColumns.length === workspace.wrappedColumns.length &&
		Object.keys(columnWidths).length ===
			Object.keys(workspace.columnWidths).length
		? workspace
		: { ...workspace, wrappedColumns, columnWidths };
}

// The workspace after the timeline moves from `current` to `entry`. A column
// the entry's document holds and the current one does not is coming back, so
// it takes the preferences recorded with the entry. Every other column keeps
// what it has now: a width set after the entry was left is newer than the one
// the entry remembers. The single owner of that rule for every history move.
export function workspaceForEntry(
	workspace: Workspace,
	current: TableDocument,
	entry: HistoryEntry,
): Workspace {
	const present = new Set(current.columns.map((column) => column.id));
	const saved = entry.columnPreferences;
	const columnWidths = { ...workspace.columnWidths };
	const wrappedColumns = [...workspace.wrappedColumns];
	let changed = false;
	for (const { id } of entry.document.columns) {
		if (present.has(id)) continue;
		const width = saved.columnWidths[id];
		if (width !== undefined && columnWidths[id] !== width) {
			columnWidths[id] = width;
			changed = true;
		}
		if (saved.wrappedColumns.includes(id) && !wrappedColumns.includes(id)) {
			wrappedColumns.push(id);
			changed = true;
		}
	}
	return reconcileColumnPreferences(
		changed ? { ...workspace, columnWidths, wrappedColumns } : workspace,
		entry.document,
	);
}
