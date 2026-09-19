import {
	IconBold,
	IconCode,
	IconItalic,
	IconStrikethrough,
	IconUnderline,
} from "@tabler/icons-react";
import { copy } from "@/copy/copy";
import {
	applyLink,
	insertImage,
	linkDraft,
	type SelectionMarkState,
	selectionMarkState,
	type TypedCells,
	typedCells,
} from "@/core/cell-formatting";
import { cellValueType, readCell } from "@/core/cell-value";
import { inlineLength, isTextContent, removeLink } from "@/core/inline-content";
import {
	activeRange,
	type CellPosition,
	type GridSelection,
	HEADER_ROW,
	selectionRects,
} from "@/core/selection";
import type {
	CellValue,
	InlineMark,
	TableDocument,
	TextContent,
} from "@/core/types";
import { useTabeloStore } from "@/state/store";
import type { ImageRequest, LinkRequest } from "./inline-dialogs";

// The Visual Table's Format commands (#306), shared by the cell menu's Format
// group and the grid's shortcuts so the two cannot disagree about what a mark
// is called, which chord toggles it, or why it is unavailable. The document
// operations they run live in the core; this is the presentation around them.

export const formatMarks = [
	{
		mark: "bold",
		label: copy.actions.bold,
		icon: IconBold,
		shortcut: copy.shortcuts.bold,
	},
	{
		mark: "italic",
		label: copy.actions.italic,
		icon: IconItalic,
		shortcut: copy.shortcuts.italic,
	},
	{
		mark: "underline",
		label: copy.actions.underline,
		icon: IconUnderline,
		shortcut: copy.shortcuts.underline,
	},
	{
		mark: "strikethrough",
		label: copy.actions.strikethrough,
		icon: IconStrikethrough,
		shortcut: copy.shortcuts.strikethrough,
	},
	{
		mark: "code",
		label: copy.actions.code,
		icon: IconCode,
		shortcut: copy.shortcuts.code,
	},
] as const satisfies readonly {
	readonly mark: InlineMark;
	readonly label: string;
	readonly icon: unknown;
	readonly shortcut: string;
}[];

export function markLabel(mark: InlineMark): string {
	return formatMarks.find((each) => each.mark === mark)?.label ?? mark;
}

// The five mark chords: Mod with B, I, or U, and Mod+Shift with S or M. The
// letter is compared without its case, because Shift changes it on some
// keyboards and not on others.
export function markForKey(event: {
	readonly key: string;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
}): InlineMark | null {
	if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
	const key = event.key.toLowerCase();
	if (event.shiftKey) {
		if (key === "s") return "strikethrough";
		if (key === "m") return "code";
		return null;
	}
	if (key === "b") return "bold";
	if (key === "i") return "italic";
	if (key === "u") return "underline";
	return null;
}

export function isLinkKey(event: {
	readonly key: string;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
}): boolean {
	return (
		(event.metaKey || event.ctrlKey) &&
		!event.shiftKey &&
		!event.altKey &&
		event.key.toLowerCase() === "k"
	);
}

// Why a mark cannot be applied here, or nothing when it can. A selection of
// typed values names them and the step that comes first (owner, 2026-09-19).
export function markRefusal(
	state: SelectionMarkState,
	typed: () => TypedCells,
): string | undefined {
	if (state === "unavailable") return copy.disabled.formatUnavailable;
	if (state !== "no-text") return undefined;
	const cells = typed();
	return cells.count > 0
		? copy.disabled.formatTypedValue(cells.types, cells.count)
		: copy.disabled.formatEmpty;
}

export interface MarkControlState {
	readonly state: SelectionMarkState;
	readonly refusal: string | undefined;
	// The typed cells the mark would leave alone beside the text it formats.
	readonly typed: TypedCells;
}

export function selectionMarkControl(
	document: TableDocument,
	selection: GridSelection,
	mark: InlineMark,
): MarkControlState {
	const rects = selectionRects(
		selection,
		document.rows.length,
		document.columns.length,
	);
	const state = selectionMarkState(document, rects, mark);
	const typed = typedCells(document, rects);
	return { state, refusal: markRefusal(state, () => typed), typed };
}

// Toggles a mark over the grid selection and says what happened: the new
// state when it changed something, the reason in a notice when it could not.
// A selection mixing text with typed values formats the text and says in a
// notice how many cells it skipped and why (owner, 2026-09-19).
export function runSelectionMark(mark: InlineMark): void {
	const store = useTabeloStore.getState();
	const { refusal, typed } = selectionMarkControl(
		store.document,
		store.selection,
		mark,
	);
	if (refusal) {
		store.pushNotice({ severity: "warning", message: refusal });
		return;
	}
	const before = store.toggleSelectionMark(mark);
	store.announceStatus(
		copy.status.formatApplied(markLabel(mark), before !== "on"),
	);
	if (typed.count > 0) {
		store.pushNotice({
			severity: "info",
			message: copy.notices.formatSkipped(typed.types, typed.count),
		});
	}
}

// The one cell a link or an image command acts on: a single selected header
// or data cell. A link and an image each belong to one run of text.
export function singleCellTarget(
	selection: GridSelection,
): CellPosition | null {
	if (selection.ranges.length !== 1) return null;
	const range = activeRange(selection);
	if (
		range.mode !== "cell" ||
		range.anchor.row !== range.focus.row ||
		range.anchor.column !== range.focus.column
	) {
		return null;
	}
	return range.focus;
}

export function readTarget(
	document: TableDocument,
	position: CellPosition,
): CellValue | undefined {
	const column = document.columns[position.column];
	if (!column) return undefined;
	if (position.row === HEADER_ROW) return column.header;
	const row = document.rows[position.row];
	return row ? readCell(row, column.id) : undefined;
}

export function writeTarget(position: CellPosition, value: TextContent): void {
	const store = useTabeloStore.getState();
	if (position.row === HEADER_ROW) store.editHeader(position.column, value);
	else store.editCell(position.row, position.column, value);
}

// Whether the link and image commands can act on the selection, and why not.
export function cellCommandRefusal(
	document: TableDocument,
	selection: GridSelection,
	command: "link" | "image",
): string | undefined {
	const target = singleCellTarget(selection);
	if (!target) {
		return command === "link"
			? copy.disabled.linkSingleCell
			: copy.disabled.imageSingleCell;
	}
	const value = readTarget(document, target);
	if (value === undefined) return copy.disabled.formatEmpty;
	if (!isTextContent(value)) {
		const type = cellValueType(value);
		return type === "string"
			? copy.disabled.formatEmpty
			: copy.disabled.formatTypedValue([type], 1);
	}
	if (command === "link") {
		const length = inlineLength(value);
		if (length === 0) return copy.disabled.formatEmpty;
		if (linkDraft(value, 0, length).holdsImage) {
			return copy.disabled.linkAroundImage;
		}
	}
	return undefined;
}

// The cell's text content as it stands now, read when a dialog answers
// rather than when it opened.
function currentText(position: CellPosition): TextContent | null {
	const value = readTarget(useTabeloStore.getState().document, position);
	return value !== undefined && isTextContent(value) ? value : null;
}

// The link dialog's request for a whole cell: its complete text, linked or
// relinked as one, or unlinked.
export function wholeCellLinkRequest(
	position: CellPosition,
	finalFocus: () => HTMLElement | null,
): LinkRequest | null {
	const value = currentText(position);
	if (value === null) return null;
	return {
		draft: linkDraft(value, 0, inlineLength(value)),
		onSave: (text, url) => {
			const current = currentText(position);
			if (current === null) return;
			const next = applyLink(current, 0, inlineLength(current), text, url);
			if (next !== null) writeTarget(position, next);
		},
		onRemove: () => {
			const current = currentText(position);
			if (current === null) return;
			writeTarget(position, removeLink(current, 0, inlineLength(current)));
		},
		finalFocus,
	};
}

// The image dialog's request for a whole cell: the image goes after the text.
export function wholeCellImageRequest(
	position: CellPosition,
	finalFocus: () => HTMLElement | null,
): ImageRequest | null {
	if (currentText(position) === null) return null;
	return {
		onInsert: (url, alt) => {
			const current = currentText(position);
			if (current === null) return;
			const end = inlineLength(current);
			const next = insertImage(current, end, end, url, alt);
			if (next !== null) writeTarget(position, next);
		},
		finalFocus,
	};
}
