import {
	IconArrowBackUp,
	IconArrowBarToDown,
	IconArrowBarToLeft,
	IconArrowBarToRight,
	IconArrowBarToUp,
	IconArrowForwardUp,
	IconArrowNarrowDown,
	IconArrowNarrowLeft,
	IconArrowNarrowRight,
	IconArrowNarrowUp,
	IconArrowsMove,
	IconArrowsSort,
	IconClipboard,
	IconCopy,
	IconScissors,
	IconSortAscending,
	IconSortDescending,
	IconTrash,
	type TablerIcon,
} from "@tabler/icons-react";
import { copy } from "@/copy/copy";
import type { SortDirection } from "@/core/operations";
import type {
	SelectionFillRefusal,
	SelectionMoveRefusal,
} from "@/core/selection";
import type { ExpectedColumnType } from "@/core/types";

// How a table command looks wherever a table menu draws it: the Visual
// Table's menus and every source pane's (#433). Presentation only: what a
// command acts on and how it runs stay with each surface's own adapter, the
// selection in the grid and the caret or a named line in a source pane, so
// nothing here reads the store. Same label, icon, and legend for the same
// command is the menu-order contract in docs/product.md.

export interface CommandPresentation {
	readonly label: string;
	readonly icon: TablerIcon;
	// The grid's key for the command. A surface whose keymap binds another
	// action to that chord leaves it out, and says why where it does.
	readonly shortcut?: string;
}

// Three directional groups share one menu, so each takes its own glyph
// family: insert lands against a boundary line, move is the long-stemmed
// narrow arrow, and fill keeps the plain arrow it drags along.
export const tableCommand = {
	cut: {
		label: copy.actions.cut,
		icon: IconScissors,
		shortcut: copy.shortcuts.cut,
	},
	copy: {
		label: copy.actions.copy,
		icon: IconCopy,
		shortcut: copy.shortcuts.copy,
	},
	paste: {
		label: copy.actions.paste,
		icon: IconClipboard,
		shortcut: copy.shortcuts.paste,
	},
	undo: {
		label: copy.actions.undo,
		icon: IconArrowBackUp,
		shortcut: copy.shortcuts.undo,
	},
	redo: {
		label: copy.actions.redo,
		icon: IconArrowForwardUp,
		shortcut: copy.shortcuts.redo,
	},
	insertRowAbove: (count: number): CommandPresentation => ({
		label: copy.actions.insertRowsAbove(count),
		icon: IconArrowBarToUp,
		shortcut: copy.shortcuts.addRowAbove,
	}),
	insertRowBelow: (count: number): CommandPresentation => ({
		label: copy.actions.insertRowsBelow(count),
		icon: IconArrowBarToDown,
		shortcut: copy.shortcuts.addRowBelow,
	}),
	insertColumnLeft: (count: number): CommandPresentation => ({
		label: copy.actions.insertColumnsLeft(count),
		icon: IconArrowBarToLeft,
		shortcut: copy.shortcuts.addColumnLeft,
	}),
	insertColumnRight: (count: number): CommandPresentation => ({
		label: copy.actions.insertColumnsRight(count),
		icon: IconArrowBarToRight,
		shortcut: copy.shortcuts.addColumnRight,
	}),
	duplicateRows: (count: number): CommandPresentation => ({
		label: copy.actions.duplicateRows(count),
		icon: IconCopy,
	}),
	duplicateColumns: (count: number): CommandPresentation => ({
		label: copy.actions.duplicateColumns(count),
		icon: IconCopy,
	}),
	moveUp: {
		label: copy.actions.moveUp,
		icon: IconArrowNarrowUp,
		shortcut: copy.shortcuts.moveUp,
	},
	moveDown: {
		label: copy.actions.moveDown,
		icon: IconArrowNarrowDown,
		shortcut: copy.shortcuts.moveDown,
	},
	moveLeft: {
		label: copy.actions.moveLeft,
		icon: IconArrowNarrowLeft,
		shortcut: copy.shortcuts.moveLeft,
	},
	moveRight: {
		label: copy.actions.moveRight,
		icon: IconArrowNarrowRight,
		shortcut: copy.shortcuts.moveRight,
	},
	// Named by the expected type of the column the sort orders by (#470).
	sort: (
		direction: SortDirection,
		type?: ExpectedColumnType,
	): CommandPresentation => ({
		label: copy.actions.sortLabel(direction, type),
		icon: direction === "ascending" ? IconSortAscending : IconSortDescending,
	}),
	deleteRows: (count: number): CommandPresentation => ({
		label: copy.actions.deleteRows(count),
		icon: IconTrash,
		shortcut: copy.shortcuts.deleteStructure,
	}),
	deleteColumns: (count: number): CommandPresentation => ({
		label: copy.actions.deleteColumns(count),
		icon: IconTrash,
	}),
} as const;

// The submenu triggers both menus draw, named and drawn the same way (#369).
export const tableCommandGroup = {
	move: { label: copy.actions.move, icon: IconArrowsMove },
	sort: { label: copy.actions.sort, icon: IconArrowsSort },
} as const;

// Why a move or a fill is refused, written once for every surface that asks:
// the menus, the keyboard, the fill handle, and a dragged row or column.
export const moveRefusalMessage: Record<SelectionMoveRefusal, string> = {
	"single-area": copy.disabled.singleAreaRequired,
	"header-row": copy.disabled.headerRowRequired,
	"first-row": copy.disabled.firstRow,
	"last-row": copy.disabled.lastRow,
	"first-column": copy.disabled.firstColumn,
	"last-column": copy.disabled.lastColumn,
};

export const fillRefusalMessage: Record<SelectionFillRefusal, string> = {
	"single-area": copy.disabled.singleAreaRequired,
	"header-row": copy.disabled.headerRowRequired,
	"first-row": copy.disabled.firstRow,
	"last-row": copy.disabled.lastRow,
	"first-column": copy.disabled.firstColumn,
	"last-column": copy.disabled.lastColumn,
};
