import { modShortcut } from "@tabelo/ui/lib/platform";
import {
	type ShortcutKeyLabels,
	spokenShortcut,
} from "@tabelo/ui/lib/shortcut";
import type { CopyScope } from "@/clipboard/serialize";
import { product } from "@/copy/product";
import { columnLetter } from "@/core/column-letter";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import type { FillSeriesRefusal } from "@/core/series";
import type {
	CellValue,
	CellValueType,
	ExpectedColumnType,
} from "@/core/types";
import type {
	EscapeMatch,
	OutputOptionId,
	ParseIssue,
	PreconditionFailure,
} from "@/formats/types";
import type { ImportError } from "@/import/prepare";
import type { PanePositionId, SplitEdge } from "@/workspace/layout";

// Every user-visible string lives here. One place to keep the voice
// consistent, and the seam a locale would plug into if Tabelo ever ships one.
// Keep the tone plain and calm: say what happened, not how clever the app is.

// Named once because it is both the visible label of the recovery command and
// the opening of the accessible name that says which refusal it belongs to.
// The command selects the offending cell, so it is named for where it goes.
const GO_TO_CELL = "Go to cell";

// Menu names that open with the command family and end with what it acts on.
// Each is named once so the family and its per-target names cannot drift.
const PANE_ACTIONS = "Pane actions";
const ROW_ACTIONS = "Row actions";
const COLUMN_ACTIONS = "Column actions";
const SELECT_ROW = "Select row";
const SELECT_COLUMN = "Select column";

// One name for source wrapping wherever it is chosen: the global default in
// Settings and a pane's own choice in its menu.
const WRAP_LINES = "Wrap lines";

// Every word a shortcut legend speaks or prints. `@tabelo/ui/lib/shortcut`
// owns the tokenizer and the glyphs; the words are copy and live here. Named
// before `copy` because a hint below speaks a chord through it, and exposed as
// `copy.keys` for the provider at the application root.
const KEYS: ShortcutKeyLabels = {
	spoken: {
		command: "Command",
		control: "Control",
		option: "Option",
		alt: "Alt",
		shift: "Shift",
		backspace: "Backspace",
		enter: "Enter",
		escape: "Escape",
		tab: "Tab",
		space: "Space",
		upArrow: "Up arrow",
		downArrow: "Down arrow",
		leftArrow: "Left arrow",
		rightArrow: "Right arrow",
		plus: "Plus",
		minus: "Minus",
	},
	// What a Windows or Linux keyboard prints on the key.
	printed: {
		control: "Ctrl",
		alt: "Alt",
		shift: "Shift",
		backspace: "Backspace",
		enter: "Enter",
		escape: "Esc",
		tab: "Tab",
		space: "Space",
	},
	spokenJoiner: " plus ",
};

// A file ending as a reader sees it, with its leading dot.
function fileExtension(extension: string): string {
	return `.${extension}`;
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

// A cell value shown the way a person could tell values apart: text in
// quotes, so an empty cell reads as "" and the number 35 is not taken for the
// text "35"; null, numbers, and booleans as they are.
function shownValue(value: CellValue): string {
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}

// What an escape sequence resolves to, named rather than shown: the character
// is the one thing the source view cannot draw there, which is why the sequence
// exists at all.
const escapeTargetNames: Record<string, string> = {
	" ": "a space",
	"\t": "a tab",
	"\n": "a line break",
	"|": "a pipe",
	"\\": "a backslash",
	"&": "an ampersand",
	"\u00a0": "a non-breaking space",
};

function escapeTarget(decoded: string): string {
	// A protected spelling restores text the format would otherwise have read as
	// its own notation.
	if (decoded.length > 1) return `the literal text ${decoded}`;
	const named = escapeTargetNames[decoded];
	if (named) return named;
	const codePoint = decoded.codePointAt(0);
	// Whitespace with no everyday name: say exactly which character it is, in
	// the notation anyone can look up.
	return codePoint === undefined
		? "nothing"
		: `the character U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

const cellTypeLabels = {
	// A string is called text wherever a person reads it (CONTEXT.md).
	string: "Text",
	number: "Number",
	boolean: "Boolean",
	null: "Null",
} as const satisfies Record<CellValueType, string>;

const expectedColumnTypeLabels = {
	text: "Text",
	number: "Number",
	boolean: "Boolean",
} as const satisfies Record<ExpectedColumnType, string>;

const views = {
	grid: {
		label: "Visual table",
		shortLabel: "Table",
		description: "Cells you edit directly",
	},
	markdown: {
		label: "Markdown",
		shortLabel: "Markdown",
		description: "For READMEs and docs, alignment included",
	},
	csv: {
		label: "CSV",
		shortLabel: "CSV",
		description: "Comma-separated, for data tools",
	},
	tsv: {
		label: "TSV",
		shortLabel: "TSV",
		description: "Tab-separated, pastes into spreadsheets",
	},
	html: {
		label: "HTML source",
		shortLabel: "HTML",
		description: "A table element for web pages",
	},
	jira: {
		label: "Jira",
		shortLabel: "Jira",
		description: "Jira wiki table syntax",
	},
	json: {
		label: "JSON",
		shortLabel: "JSON",
		description: "An array of objects keyed by column name",
	},
	records: {
		label: "Records",
		shortLabel: "Records",
		description: "One titled bullet list per row",
	},
	"html-preview": {
		label: "Rendered preview",
		shortLabel: "Preview",
		description: "A formatted table for Word, Google Docs, Slack, and email",
	},
} as const;

function joinedPositions(values: readonly string[]): string {
	if (values.length <= 1) return values[0] ?? "";
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function preconditionMessage(failure: PreconditionFailure): string {
	const columns = failure.columns?.map(columnLetter) ?? [];
	const columnSubject = columns.length
		? `${columns.length === 1 ? "column" : "columns"} ${joinedPositions(columns)}`
		: "the affected columns";

	switch (failure.code) {
		case "json-duplicate-header":
			return `JSON uses every header as a unique object key. Rename ${columnSubject} so no keys repeat.`;
		case "json-numeric-header":
			return `JSON reorders object keys written as whole numbers before other keys. Rename ${columnSubject} to preserve the table's column order.`;
		case "records-empty-first-header":
			return `Records titles every record with the first column's header. Name ${columnSubject} to use this view.`;
		case "records-duplicate-header":
			return `Records matches each bullet back to a column by its header. Rename ${columnSubject} so no headers repeat.`;
		default:
			break;
	}

	const rowSubject = failure.rows?.length
		? `${failure.rows.length === 1 ? "row" : "rows"} ${joinedPositions(failure.rows.map((index) => String(index + 2)))}`
		: "the affected rows";

	switch (failure.code) {
		case "records-empty-first-column":
			return `Records titles every record with the first column's value. Fill in ${rowSubject} to use this view.`;
		case "records-duplicate-first-column":
			return `Records titles every record with the first column's value. Make ${rowSubject} unique to use this view.`;
		default:
			break;
	}

	const locations: string[] = [];
	if (columns.length) {
		locations.push(
			`${columns.length === 1 ? "column" : "columns"} ${joinedPositions(columns)}`,
		);
	}
	if (failure.rows?.length) {
		const rows = failure.rows.map((index) => String(index + 2));
		locations.push(
			`${rows.length === 1 ? "row" : "rows"} ${joinedPositions(rows)}`,
		);
	}
	const subject = locations.length ? ` ${joinedPositions(locations)}` : "";
	return `This view can't represent${subject}. Correct the table to use this view.`;
}

export const copy = {
	app: product,

	views,

	cellTypes: {
		real: cellTypeLabels,
		expected: expectedColumnTypeLabels,
	},

	layouts: {
		single: { label: "One pane", description: "One view at a time" },
		columns: { label: "Two columns", description: "Side by side" },
		rows: { label: "Two rows", description: "Stacked" },
		"left-split": {
			label: "Split left",
			description: "Two stacked on the left, one tall on the right",
		},
		"right-split": {
			label: "Split right",
			description: "One tall on the left, two stacked on the right",
		},
		"top-split": {
			label: "Split top",
			description: "Two across the top, one wide below",
		},
		"bottom-split": {
			label: "Split bottom",
			description: "One wide on top, two across the bottom",
		},
		quad: { label: "Four panes", description: "All four views at once" },
	},

	panePositions: {
		full: "Full workspace",
		"top-full-width": "Top, full width",
		"bottom-full-width": "Bottom, full width",
		"left-full-height": "Left, full height",
		"right-full-height": "Right, full height",
		"top-left": "Top left",
		"top-right": "Top right",
		"bottom-left": "Bottom left",
		"bottom-right": "Bottom right",
	} satisfies Record<PanePositionId, string>,

	newTable: {
		title: "Start a new table?",
		description: "This clears the current table and any unfinished edits.",
		confirm: "Start new table",
	},

	headerImport: {
		title: "Is row 1 a header row?",
		description: "Row 1 can hold column names or be the first data row.",
		asData: "Keep as data",
		asHeaders: "Use as header row",
	},

	appUpdate: {
		label: "Reload to update",
		description: "A new version is ready",
	},

	settings: {
		title: "Settings",
		description:
			"Choose how every source view shows your table. Your table doesn't change.",
		done: "Done",
		reset: "Reset to defaults",
		previewLabel: "Preview",
		preview: "Preview of a source view with the chosen settings",
		display: {
			label: "Source views",
		},
		wrap: {
			label: WRAP_LINES,
			description: "Long lines continue below instead of scrolling sideways",
		},
		spaceIndicators: {
			label: "Spaces",
			options: {
				none: { label: "Never", description: "Spaces aren't marked" },
				boundary: {
					label: "Around values",
					description: "Runs of spaces, and spaces at a value's edges",
				},
				trailing: {
					label: "At line ends",
					description: "Spaces at the end of a line",
				},
				all: { label: "Always", description: "Every space" },
			},
		},
		tabIndicators: {
			label: "Tabs",
			description: "An arrow where a tab separates values",
		},
		emptyValueIndicators: {
			label: "Empty values",
			description: "A word where a field holds nothing",
		},
		saveError:
			"Settings couldn't be saved. Allow browser storage or free some space, then try again.",
		// Shown while the stored settings are unreadable: a change applies, but
		// it is never what overwrites them.
		sessionOnly:
			"Your saved settings couldn't be read, so changes last until you close Tabelo. Replace saved settings to keep them.",
	},

	workspace: {
		// The dialog is titled for what it holds; the command that opens it is a
		// verb like every other command.
		layout: "Layout",
		changeLayout: "Change layout",
		layoutHint: "Choose how the open views are arranged",
		applyLayout: "Apply layout",
		changeView: "Change view",
		changeViewHint: (label: string) =>
			`Choose the view shown in the ${label} pane`,
		movePane: "Move pane",
		movePaneHint: (label: string) => `Choose where to move the ${label} pane`,
		moveDestination: "Pane position",
		destinationView: (label: string) => `Currently ${label}`,
		addView: "Add view",
		closeView: "Close view",
		paneActions: PANE_ACTIONS,
		paneActionsFor: (label: string) => `${PANE_ACTIONS}: ${label}`,
		// A pane named by the view it shows, on screen and to assistive
		// technology alike.
		pane: (label: string) => `${label} pane`,
		readOnly: "Read-only",
		// The splitters move panes, not table columns or rows, so their names
		// say so while still telling the two directions apart.
		resizeColumns: "Resize side-by-side panes",
		resizeRows: "Resize stacked panes",
		zoom: (percent: number) => `Zoom ${percent}%`,
		zoomPercent: (percent: number) => `${percent}%`,
		zoomLabel: "Zoom",
		tableSize: (columns: number, rows: number) =>
			`${columns} ${columns === 1 ? "column" : "columns"} · ${rows} ${rows === 1 ? "row" : "rows"}`,
		zoomOut: "Zoom out",
		zoomIn: "Zoom in",
		resetZoom: "Reset zoom",
		wrapSource: WRAP_LINES,
		wrapAllColumns: "Wrap all columns",
		// The checked escape mode for a format's structural assistance (#297),
		// called smart editing wherever a person reads it (CONTEXT.md).
		structuralAssistance: "Smart editing",
		// Both halves of one piece of feedback: the pane header shows this and
		// the polite live region speaks it. How many occurrences the user has
		// gathered, out of how many the source holds.
		occurrencesSelected: (selected: number, total: number) =>
			`${selected} of ${total} ${total === 1 ? "match" : "matches"} selected`,
	},

	find: {
		// The bar's own accessible name, and the label of the command that opens
		// it. One value, so the menu item and the surface it reveals cannot drift
		// apart.
		title: "Find and replace",
		// The same, for a read-only pane, whose bar finds and cannot replace.
		titleReadOnly: "Find",
		// Each field's label and its placeholder are the same word: the bar is
		// one dense row docked at the foot of its pane, so a visible label
		// beside every control would cost the width the field exists to have.
		query: "Find",
		replacement: "Replace with",
		matchCase: "Match case",
		// Replacing costs a second row, so it is asked for rather than assumed.
		showReplace: "Show replace",
		hideReplace: "Hide replace",
		selectAll: "Select every matching cell",
		previous: "Previous match",
		next: "Next match",
		replace: "Replace match",
		replaceAll: "Replace every match",
		close: "Close find",
		// The count reads compactly on screen and in full when it is spoken. The
		// same number either way: one is a legend beside the controls, the other
		// is a sentence with no controls around it to give it context.
		count: (index: number, total: number) => `${index}/${total}`,
		position: (index: number, total: number) =>
			`${index} of ${total} ${total === 1 ? "match" : "matches"}`,
		// A source pane's caret can stand away from every match: the user
		// clicked elsewhere in the text. The total still holds, and there is no
		// position to claim.
		countUnplaced: (total: number) => `?/${total}`,
		positionUnplaced: (total: number) =>
			`${total} ${total === 1 ? "match" : "matches"}`,
		noMatches: "No matches",
		replaced: (count: number) =>
			`${count} ${count === 1 ? "match" : "matches"} replaced.`,
		nothingReplaced: "Nothing was replaced.",
	},

	disabled: {
		viewAlreadyOpen: (label: string) =>
			`${label} is already open in another pane.`,
		chooseAvailableView: "Choose an available view first.",
		layoutAlreadyApplied: "This layout is already applied.",
		layoutOnlyArrangement:
			"This number of views has only one arrangement. Add or close a view to change it.",
		viewAlreadyShown: "This view is already shown in this pane.",
		zoomMinimum: "Zoom is already at 50%.",
		zoomDefault: "Zoom is already at 100%.",
		zoomMaximum: "Zoom is already at 200%.",
		closeOnlyView: "At least one view must stay open.",
		moveOnlyView: "Add another view before moving this pane.",
		chooseMoveDestination: "Choose an available pane position first.",
		addViewMaximum: "Four views is the maximum. Close one to add another.",
		addViewNarrow: "A narrow window holds two views. Widen it to add another.",
		undo: "Nothing to undo.",
		redo: "Nothing to redo.",
		// Transposing swaps rows for columns, so a table inside every import
		// limit can come out beyond one. The reason names the shape it would make.
		transposeLimit: (error: ImportError) => {
			switch (error.code) {
				case "too-many-rows":
					return `Transposing would make ${error.actual} rows, over the ${error.limit} limit. Remove columns first.`;
				case "too-many-columns":
					return `Transposing would make ${error.actual} columns, over the ${error.limit} limit. Remove rows first.`;
				case "too-many-cells":
					return `Transposing would make ${error.actual} cells, over the ${error.limit} limit. Reduce the table first.`;
				default:
					return "This table can't be transposed.";
			}
		},
		noEmptyRowsOrColumns: "There are no empty rows or columns.",
		// An entirely empty table is left alone rather than reduced to nothing.
		tableHasNoContent: "The table has no content yet.",
		sourceNothingSelected: "Select some text first.",
		sourceReadOnly: "This view is read-only.",
		// A structural command in a source pane acts on the table row under the
		// caret, so text the table has not read back names no row (#255).
		sourceRowUnparsed: "Fix the text so it reads as a table first.",
		sourceRowOutside: "Put the caret in a table row first.",
		fitWrappedColumn: "Turn off Wrap text to fit this column.",
		columnAlreadyFitted: "This column already fits its content.",
		columnFitUnavailable: "This column can't be measured right now.",
		firstRow: "The selected row is already first.",
		lastRow: "The selected row is already last.",
		firstColumn: "The selected column is already first.",
		lastColumn: "The selected column is already last.",
		sortSingleRow: "Sorting needs at least two rows. Add a row first.",
		lastRemainingRow: "A table must keep at least one row.",
		lastRemainingColumn: "A table must keep at least one column.",
		headerRowRequired: "Every table keeps its header row.",
		// Inserting, moving, and pasting each need one place to act. A selection
		// holding several separate areas names several, so the action refuses
		// rather than picking one of them, and says how to make one: the modifier
		// click keeps areas separate even when they touch, which is exactly the
		// selection that lands a user here.
		singleAreaRequired:
			"Use Shift-click or drag to select one area instead of several.",
		singleCellRequired: "Select one data cell to change its type.",
		// The focus move stops at the same edges the arrow keys do, and says
		// which edge it is already sitting on rather than doing nothing.
		focusTopRow: "The focused cell is already in the top row.",
		focusLastRow: "The focused cell is already in the last row.",
		focusFirstColumn: "The focused cell is already in the first column.",
		focusLastColumn: "The focused cell is already in the last column.",
		noQuery: "Type something to find first.",
		// Both the step and the replace controls refuse for the same reason, so
		// they say the same thing rather than inventing two wordings for it.
		noMatchingCell: "No cell holds that text.",
		// The same refusal in a pane that searches its own text rather than cells.
		noMatchingText: "This view does not contain that text.",
		cellTypeConversion: (label: string) =>
			`This value can't be converted to ${label.toLowerCase()}.`,
		updateInProgress: "The update is already being applied.",
		codecPrecondition: (failure: PreconditionFailure) =>
			preconditionMessage(failure),
	},

	source: {
		blocked: (failure: PreconditionFailure) => preconditionMessage(failure),
		// The placeholder standing where a source syntax holds an empty
		// field. Drawn in the annotation tone so it reads as an annotation rather
		// than as text the user typed. Defined in the core because Markdown's serializer
		// reserves room for it: see core/empty-value.ts.
		emptyValue: EMPTY_VALUE_PLACEHOLDER,
		// What a glyph drawn over an escape sequence stands for, said on hover.
		// The sequence is spelled out as the source writes it, so the reader can
		// match what the tooltip names against what the file holds.
		escapeSequence: (match: EscapeMatch) =>
			`${match.source} is an escape sequence for ${escapeTarget(match.decoded)}.`,
		issue: (issue: ParseIssue) => {
			let message: string;
			switch (issue.code) {
				case "empty-source":
					message = "Nothing to read yet.";
					break;
				case "markdown-table-incomplete":
					message =
						"A Markdown table needs a header row and a divider row below it.";
					break;
				case "markdown-divider-required":
					message = "The second line must be a divider like | --- | --- |.";
					break;
				case "markdown-divider-column-count":
					message = `The divider has ${issue.actual} columns but the header has ${issue.expected}.`;
					break;
				case "row-column-count":
					message = `Row ${issue.row} has ${issue.actual} ${issue.actual === 1 ? "cell" : "cells"}, the table has ${issue.expected} columns.`;
					break;
				case "jira-header-required":
					message =
						"A Jira table starts with a header row using || around each cell.";
					break;
				case "html-unavailable":
					message = "HTML can't be read in this environment.";
					break;
				case "html-table-required":
					message =
						"No <table> found yet. A table needs rows of <th> or <td> cells.";
					break;
				case "json-invalid":
					message = "This isn't valid JSON yet.";
					break;
				case "json-rows-required":
					message = "JSON must be a non-empty array of rows.";
					break;
				case "json-row-object-required":
					message = "Each JSON row must be an object of column values.";
					break;
				case "json-header-required":
					message = "At least one JSON row must name a column.";
					break;
				case "json-scalar-cells-required":
					message =
						"Every JSON cell must be a string, number, boolean, or null.";
					break;
				case "delimited-unclosed-quote":
					message = "A quoted field isn't closed.";
					break;
				case "delimited-invalid-quote":
					message = "A quoted field contains an unexpected quote.";
					break;
				case "delimited-delimiter-undetected":
					message = "The column separator couldn't be detected.";
					break;
				case "delimited-field-count":
					message = "This row has a different number of fields.";
					break;
				case "delimited-parse-error":
					message = "This text couldn't be read yet.";
					break;
				case "records-title-required":
					message = "Each record starts with a title line like Header: Value.";
					break;
				case "records-title-mismatch":
					message =
						"Every record's title must use the same first column header.";
					break;
				case "records-bullet-required":
					message =
						"Each line after the title must be a bullet like - Header: Value.";
					break;
				case "records-unknown-column":
					message =
						"This bullet's header doesn't match a column from the first record.";
					break;
			}
			return issue.line === undefined
				? message
				: `Line ${issue.line}: ${message}`;
		},
	},

	actions: {
		openAppMenu: "Tabelo menu",
		openAppMenuWithUpdate: "Tabelo menu, update available",
		github: product.sourceLabel,
		dismiss: "Dismiss",
		undo: "Undo",
		redo: "Redo",
		transposeTable: "Transpose table",
		deleteEmptyRowsAndColumns: "Delete empty rows and columns",
		insertRowsAbove: (count: number) =>
			`Insert ${count === 1 ? "row" : "rows"} above`,
		insertRowsBelow: (count: number) =>
			`Insert ${count === 1 ? "row" : "rows"} below`,
		insertColumnsLeft: (count: number) =>
			`Insert ${count === 1 ? "column" : "columns"} left`,
		insertColumnsRight: (count: number) =>
			`Insert ${count === 1 ? "column" : "columns"} right`,
		duplicateRows: (count: number) =>
			`Duplicate ${count === 1 ? "row" : "rows"}`,
		duplicateColumns: (count: number) =>
			`Duplicate ${count === 1 ? "column" : "columns"}`,
		deleteRows: (count: number) => `Delete ${count === 1 ? "row" : "rows"}`,
		deleteColumns: (count: number) =>
			`Delete ${count === 1 ? "column" : "columns"}`,
		clear: "Clear contents",
		moveUp: "Move up",
		moveDown: "Move down",
		moveLeft: "Move left",
		moveRight: "Move right",
		// A source pane's menu also holds text commands, so its row move names
		// the row (#255).
		moveRowUp: "Move row up",
		moveRowDown: "Move row down",
		fill: "Fill",
		// The menu path that replaces the removed four-key focus chord. Named
		// for what it preserves, because that is the whole reason to reach for
		// it instead of an arrow key.
		moveFocus: "Move focus, keep selection",
		moveFocusUp: "Move focus up",
		moveFocusDown: "Move focus down",
		moveFocusLeft: "Move focus left",
		moveFocusRight: "Move focus right",
		fillUp: "Fill up",
		fillDown: "Fill down",
		fillLeft: "Fill left",
		fillRight: "Fill right",
		alignLeft: "Align left",
		alignCenter: "Align center",
		alignRight: "Align right",
		alignDefault: "No alignment",
		alignment: "Alignment",
		// Sorting reorders the table itself rather than the view, so the labels
		// say what the rows do and never suggest a sort that stays applied.
		sortAscending: "Sort ascending",
		sortDescending: "Sort descending",
		expectedType: "Expected type",
		cellType: "Cell type",
		edit: "Edit",
		move: "Move",
		copy: "Copy",
		cut: "Cut",
		paste: "Paste",
		// Source-view text commands, offered by its context menu (#234).
		selectAllText: "Select all",
		selectNextOccurrence: "Select next match",
		rowActions: ROW_ACTIONS,
		rowActionsFor: (row: string) => `${ROW_ACTIONS}: ${row}`,
		columnActions: COLUMN_ACTIONS,
		columnActionsFor: (column: string) => `${COLUMN_ACTIONS}: ${column}`,
		copySource: "Copy source",
		copyFormattedTable: "Copy formatted table",
		// The document as a chosen format, whatever the workspace happens to be
		// showing. Distinct from Copy source, which copies the pane in front of
		// the user, draft and all.
		copyAs: "Copy as",
		downloadTable: "Download table",
		download: "Download",
		cancel: "Cancel",
		renameTable: "Rename table",
		importFile: "Import file",
		newTable: "New table",
		selectRow: SELECT_ROW,
		selectColumn: SELECT_COLUMN,
		fitColumnToContent: "Fit column to content",
		setColumnWidth: "Set column width",
		wrapColumnText: "Wrap text",
		// Offered on the first data row and the first data column only, which is
		// the axis each one pins, so the label says what it does rather than
		// which row or column it would reach from somewhere else.
		pinFirstRow: "Keep this row visible",
		pinFirstColumn: "Keep this column visible",
		editHeader: "Rename column",
		// The command that sits beside a choice its codec has refused. The
		// refusal already says what is wrong; this takes the user to the cell.
		goToCell: GO_TO_CELL,
	},

	typedEditing: {
		choiceTitle: "Choose how to store this value",
		choiceDescription: (
			type: ExpectedColumnType,
			input: string,
			converted: string,
		) =>
			`${JSON.stringify(input)} is valid ${expectedColumnTypeLabels[type].toLowerCase()} input and converts to ${JSON.stringify(converted)}. Keep it as text to store exactly what you typed.`,
		invalidTitle: "Value doesn't match the expected type",
		invalidDescription: (type: ExpectedColumnType, input: string) =>
			`${JSON.stringify(input)} isn't a valid ${expectedColumnTypeLabels[type].toLowerCase()}. Keep editing it or keep it as text.`,
		keepEditing: "Keep editing",
		keepAsText: "Keep as text",
		convertTo: (type: ExpectedColumnType) =>
			`Convert to ${expectedColumnTypeLabels[type].toLowerCase()}`,
	},

	tableName: {
		label: "Table name",
		description: "Used for downloads and the browser tab",
		confirm: "Rename",
		empty: "Enter a table name.",
		tooLong: "Use 120 characters or fewer.",
		unchanged: "Enter a different table name.",
		saveError: "The table name couldn't be saved. Try again.",
	},

	// Confirming a Cell type change that replaces a value (#371). Values are
	// shown by shownValue, so the reader can tell text from other types.
	cellTypeChange: {
		title: (label: string) => `Change this cell to ${label.toLowerCase()}?`,
		fillsEmpty: (after: CellValue) =>
			`The empty cell becomes ${shownValue(after)}.`,
		losesOriginal: (
			before: CellValue,
			after: CellValue,
			back: CellValue | null,
		) =>
			back === null
				? `${shownValue(before)} becomes ${shownValue(after)}. Changing the type back can't bring ${shownValue(before)} back.`
				: `${shownValue(before)} becomes ${shownValue(after)}. Changing the type back gives ${shownValue(back)}, not ${shownValue(before)}.`,
		confirm: "Change type",
	},

	// Changing a column's expected type converts its cells (#392). When some
	// cells can't reach the new type without losing their value, it asks first
	// and says how many; the rest convert.
	columnTypeChange: {
		title: (label: string) =>
			`Change the expected type to ${label.toLowerCase()}?`,
		description: (count: number, label: string) =>
			count === 1
				? `1 cell can't become ${label.toLowerCase()} without losing its value. It keeps its value and type, and every other cell converts.`
				: `${count} cells can't become ${label.toLowerCase()} without losing their value. They keep their value and type, and every other cell converts.`,
		confirm: "Convert the rest",
	},

	// Typing a column's exact width (#370). Widths are rem, the unit the width
	// announcements already speak, so the number here and the one read out
	// after a keyboard resize are the same number.
	columnWidth: {
		dialogTitle: (column: string) => `Column ${column} width`,
		description: (min: number, max: number, fallback: number) =>
			`A width from ${min} to ${max} rem. The default is ${fallback} rem.`,
		label: "Width in rem",
		// Both the note under the field and the reason Use default is off.
		atDefault: "This column already has the default width.",
		useDefault: "Use default",
		confirm: "Set width",
		unchanged: "Enter a different width.",
		notANumber: "Enter a number, for example 12.",
		tooSmall: (min: number) => `Use ${min} rem or more.`,
		tooLarge: (max: number) => `Use ${max} rem or less.`,
	},

	addView: {
		title: "Add view",
		// Says where the pane will land, because the control that opened this is
		// on one particular edge and the answer differs per edge.
		hint: (edge: SplitEdge, paneLabel: string) =>
			edge === "bottom"
				? `The new view opens below the ${paneLabel}`
				: `The new view opens to the right of the ${paneLabel}`,
		view: "View",
	},

	download: {
		savesAs: (filename: string) => `Saves as ${filename}`,
		fileExtension,
		downloadAs: (extension: string) => `Download ${fileExtension(extension)}`,
		format: "File format",
		options: "Options",
		// Output-only choices, listed by the id the codec declares.
		option: (id: OutputOptionId) =>
			id === "includeFirstColumnName"
				? "Include column name in titles"
				: "Include empty values",
		optionHint: (id: OutputOptionId) =>
			id === "includeFirstColumnName"
				? 'Each record title starts with it, like "Name: Ingrid"'
				: "A field with no value prints an empty bullet instead of being left out",
		invalidDraft:
			"Your unfinished edits aren't valid yet. The download uses the last valid table.",
		copyDraft: "Copy source",
	},

	empty: {
		// The surface is named by the product, which is what it introduces.
		title: product.name,
		// Said once, on first sight: what the product is, who made it, and where
		// its source lives (#362). The same words reach the HTML shell at build
		// time, so a reader without JavaScript and a search engine see them too.
		intro: `${product.description}.`,
		credit: product.creditLabel,
		source: product.sourceLabel,
		emptyAction: "Start with an empty table",
		emptyDetail: (columns: number) => `${columns} columns, ready to type`,
		pasteAction: "Paste a table",
		pasteDetail: "From a spreadsheet, web page, or text editor",
		importDetail: (extensions: readonly string[]) =>
			extensions.map(fileExtension).join(", "),
		previewTitle: "No rows yet",
		previewBody: "Add a row to see the formatted table here",
	},

	status: {
		// The state a choice carries beside its label when it can't be chosen.
		inUse: "In use",
		unavailable: "Unavailable",
		columnWidth: (column: string, rem: number) =>
			`Column ${column} width ${Number.parseFloat(rem.toFixed(2))} rem.`,
		columnWidthMinimum: (column: string) =>
			`Column ${column} is already at its minimum width.`,
		columnWidthMaximum: (column: string) =>
			`Column ${column} is already at its maximum width.`,
		cellsFilled: (count: number) =>
			`${count} ${count === 1 ? "cell" : "cells"} filled.`,
		seriesFilled: (count: number) =>
			`${count} ${count === 1 ? "cell" : "cells"} continued as a series.`,
		rowsSorted: (count: number) =>
			`${count} ${count === 1 ? "row" : "rows"} sorted.`,
		// A table already in that order was sorted, and nothing moved. Saying so
		// is the difference between a quiet success and a command that looks
		// broken.
		rowsAlreadySorted: "The rows are already in this order.",
		tableTransposed: (columns: number, rows: number) =>
			`Table transposed: ${columns} ${columns === 1 ? "column" : "columns"}, ${rows} ${rows === 1 ? "row" : "rows"}.`,
		emptyRowsAndColumnsDeleted: (rows: number, columns: number) => {
			const parts = [
				rows > 0 ? `${rows} empty ${rows === 1 ? "row" : "rows"}` : "",
				columns > 0
					? `${columns} empty ${columns === 1 ? "column" : "columns"}`
					: "",
			].filter((part) => part !== "");
			return `Deleted ${parts.join(" and ")}.`;
		},
		loading: "Loading…",
	},

	notices: {
		pendingPaneAction: (kind: "view" | "close") =>
			kind === "close"
				? "These edits aren't valid yet. Fix them, or discard them to close the view."
				: "These edits aren't valid yet. Fix them, or discard them to change views.",
		discardPaneAction: (kind: "view" | "close") =>
			kind === "close" ? "Discard and close" : "Discard and change",
		// The message says what went wrong and what to do; the detail line
		// says what did not happen, the same for every refusal.
		importError: (error: ImportError) => {
			switch (error.code) {
				case "invalid-format":
					return `Not valid ${views[error.format].shortLabel}.`;
				case "too-many-rows":
					return `${error.actual} rows, over the ${error.limit} limit. Remove rows and try again.`;
				case "too-many-columns":
					return `${error.actual} columns, over the ${error.limit} limit. Remove columns and try again.`;
				case "too-many-cells":
					return `${error.actual} cells, over the ${error.limit} limit. Reduce the table and try again.`;
				case "payload-too-large":
					return "Over the 1 MB limit. Use less data and try again.";
				case "empty":
					return "Nothing to import.";
			}
		},
		importUnchanged: "Your table is unchanged.",
		copied: (scope: CopyScope) =>
			scope === "source"
				? "Source copied"
				: scope === "preview"
					? "Formatted table copied"
					: scope === "format"
						? "Table copied"
						: "Copied",
		// Tabelo cannot grant itself clipboard permission, so the recovery is
		// always the keyboard. It stays available because a trusted key press
		// never needs the permission the button does.
		// The app knows which keyboard the user has, so it names one key rather
		// than offering both spellings of the same shortcut.
		clipboardReadFailed: `Paste was blocked. Use ${modShortcut("V")} instead.`,
		clipboardWriteFailed: (scope: CopyScope) =>
			scope === "source"
				? `Copy was blocked. Select the text and use ${modShortcut("C")}.`
				: scope === "preview"
					? `Copy was blocked. Select the table and use ${modShortcut("C")}.`
					: // A format copy is document-level, so there may be no pane showing
						// the text the user asked for. The recovery has to name the pane
						// first, rather than telling them to select something absent.
						scope === "format"
						? `Copy was blocked. Open the format in a pane and use ${modShortcut("C")}.`
						: `Copy was blocked. Select the cells and use ${modShortcut("C")}.`,
		clipboardEmpty: "Nothing on the clipboard",
		storageUnavailable:
			"Browser storage is unavailable. Download a copy before closing.",
		storageQuota: "Browser storage is full. Download a copy before closing.",
		// One sentence per reason, because "saved by a newer Tabelo" and
		// "damaged" set opposite expectations: only the first means the data is
		// probably intact. Each also says what the download is, since the file
		// is the saved data as it was found and cannot be imported as a table.
		savedTableUnreadable: {
			"future-version":
				"This table was saved by a newer version and can't be opened here. The saved data is untouched.",
			"migration-failed":
				"This table was saved by an older version and couldn't be updated. The saved data is untouched.",
			"current-schema-invalid":
				"The saved table is damaged and couldn't be opened. The saved data is untouched.",
			"invalid-json":
				"The saved table is damaged and couldn't be read. The saved data is untouched.",
		},
		recoveryFileNote:
			"Download original saves that data exactly as found, for recovery by hand. It isn't a table to import.",
		// The same four reasons for the Settings payload. Nothing in the table is
		// at risk, so each says what is in use instead.
		savedSettingsUnreadable: {
			"future-version":
				"Your settings were saved by a newer version and can't be read here. Defaults are in use, and the saved settings are untouched.",
			"migration-failed":
				"Your settings were saved by an older version and couldn't be updated. Defaults are in use, and the saved settings are untouched.",
			"current-schema-invalid":
				"The saved settings are damaged and couldn't be read. Defaults are in use, and the saved settings are untouched.",
			"invalid-json":
				"The saved settings are damaged and couldn't be read. Defaults are in use, and the saved settings are untouched.",
		},
		settingsRecoveryFileNote:
			"Download original saves them exactly as found. Changes last until you close Tabelo unless you replace them.",
		replaceSavedSettings: "Replace saved settings",
		replacedSavedSettings: "Saved settings replaced. The original was kept.",
		storageRecoveryUnavailable: "No recovery copy: storage is unavailable.",
		storageRecoveryQuota: "No recovery copy: storage is full.",
		// The fill already happened and the table is correct as it stands. This
		// offers the other reading of the same selection; it never says the
		// repeat was a mistake.
		fillSeriesOffer:
			"The selected numbers were repeated. Continue them as a series?",
		fillSeries: "Continue series",
		keepCopiedValues: "Keep repeated",
		fillSeriesUnavailable: (refusal: FillSeriesRefusal) => {
			switch (refusal) {
				case "stale":
				case "nothing-to-extend":
					return "The table has changed. Fill again to continue the numbers.";
				case "not-representable":
					return "The series would run past the numbers this table can hold.";
				case "expected-type":
					return "These cells expect true or false, not numbers.";
				default:
					return "These cells can no longer continue as a series.";
			}
		},
		downloadCopy: "Download a copy",
		downloadOriginal: "Download original",
		replaceSavedData: "Replace saved data",
		replacedSavedData: "Saved data replaced. The original was kept.",
		updateCheckFailed: "Couldn't check for an update. Try again later.",
		updateFailed: "Couldn't update. Reload and try again.",
	},

	a11y: {
		opensInNewTab: "(opens in a new tab)",
		grid: "Table editor",
		workspace: "Workspace",
		notices: "Notices",
		headerRow: "Row 1",
		paneInteractHint: "Press Enter to interact, Escape to exit.",
		enteredPane: "Entered pane. Press Escape to exit.",
		paneAdded: (label: string) => `${label} pane added`,
		// Which pane, and which way. Four controls all called "Add view" would
		// name nothing: the direction is the whole content of the choice.
		addViewAt: (edge: SplitEdge, paneLabel: string) =>
			edge === "bottom"
				? `Add a view below the ${paneLabel}`
				: `Add a view to the right of the ${paneLabel}`,
		rowNumber: (index: number) => `Row ${index + 2}`,
		selectHeaderRow: "Select header row",
		selectRowNamed: (row: string) => `${SELECT_ROW}: ${row}`,
		selectColumnNamed: (column: string) => `${SELECT_COLUMN}: ${column}`,
		columnLetter,
		// Header cells name themselves after what they contain, because that name
		// is what a screen reader reads out as the context for every cell beneath
		// or beside them. A column with an empty header falls back to its letter
		// from the index strip, so the announcement is never silent without
		// inventing content that would serialize into the document.
		columnHeader: (header: string, column: number) =>
			header.trim() === "" ? columnLetter(column) : header,
		columnWithExpectedType: (
			header: string,
			column: number,
			type: ExpectedColumnType,
		) =>
			`${header.trim() === "" ? columnLetter(column) : header}, expected type ${expectedColumnTypeLabels[type].toLowerCase()}`,
		// Read after a cell value it qualifies, so it opens with its own comma
		// and stays lowercase.
		cellTypeQualifier: (type: CellValueType) =>
			`, type ${cellTypeLabels[type].toLowerCase()}`,
		expectedColumnType: (type: ExpectedColumnType) =>
			`Expected type ${expectedColumnTypeLabels[type].toLowerCase()}`,
		// The editor that opens inside a cell is a control, not a cell, so it
		// names itself by position rather than borrowing the cell's value.
		// Columns go by the letters of the index strip, as everywhere else.
		cellEditor: (row: number, column: number) =>
			`Row ${row + 2}, column ${columnLetter(column)}`,
		cellEditorWithType: (row: number, column: number, type: CellValueType) =>
			`Row ${row + 2}, column ${columnLetter(column)}, type ${cellTypeLabels[type].toLowerCase()}`,
		headerEditor: (header: string, column: number) =>
			`Rename ${header.trim() === "" ? `column ${columnLetter(column)}` : header}`,
		// A list can refuse more than one choice at a time, and every recovery
		// command in it reads "Go to cell". The refused choice is what tells them
		// apart, so it ends the accessible name while the visible label opens it.
		goToCellFor: (label: string) => `${GO_TO_CELL} for ${label}`,
		sourceEditor: (format: string) => `${format} source`,
		preview: "Formatted table",
		blockedView: "Why this view is unavailable",
		selectionSummary: (rows: number, columns: number) =>
			rows === 1 && columns === 1
				? "1 cell selected"
				: `${plural(rows, "row", "rows")} by ${plural(columns, "column", "columns")} selected`,
		// A selection holding several separate areas has no single extent to
		// read out, so the summary states the total instead: how many columns,
		// how many rows, or how many areas when the areas are not one shape.
		multiSelectionSummary: (
			scope: "row" | "column" | "area",
			total: number,
		): string => {
			const noun =
				scope === "column" ? "column" : scope === "row" ? "row" : "area";
			return `${total} ${noun}${total === 1 ? "" : "s"} selected`;
		},
		fillHandle: "Fill selected cells",
		// Spoken, so the chord is named the way the user's keyboard names it.
		fillHandleHint: `Drag to repeat the selection, or press ${spokenShortcut("Mod+Alt", KEYS)} with an arrow key.`,
	},

	keys: KEYS,

	shortcuts: {
		find: "Mod+F",
		undo: "Mod+Z",
		redo: "Mod+Shift+Z",
		// The four insert actions form one symmetric family: the modifier picks
		// the axis, Mod for rows and Alt for columns, and Shift chooses the
		// preceding side. Every one stays inside the three-key limit that
		// docs/design-system/9-accessibility.md sets for the whole product.
		addRowBelow: "Mod+Enter",
		addRowAbove: "Mod+Shift+Enter",
		addColumnRight: "Alt+Enter",
		addColumnLeft: "Alt+Shift+Enter",
		edit: "Enter",
		clear: "Backspace",
		deleteStructure: "Mod+Backspace",
		copy: "Mod+C",
		cut: "Mod+X",
		paste: "Mod+V",
		selectAll: "Mod+A",
		selectNextOccurrence: "Mod+D",
		// Alt keeps these clear of Mod+plus, Mod+minus, and Mod+0, which belong to
		// the browser and stay the way to scale the whole interface.
		zoomOut: "Mod+Alt+-",
		resetZoom: "Mod+Alt+0",
		zoomIn: "Mod+Alt++",
		editHeader: "F2",
		// Named arrow keys rather than bare glyphs: the legend renders the same
		// arrow either way, and only the named form carries a spoken label.
		fillUp: "Mod+Alt+ArrowUp",
		fillDown: "Mod+Alt+ArrowDown",
		fillLeft: "Mod+Alt+ArrowLeft",
		fillRight: "Mod+Alt+ArrowRight",
		// The grid has reordered rows and columns on Alt+arrow since it grew a
		// keyboard path at all. These legends advertise that binding; they do
		// not add a second one.
		moveUp: "Alt+ArrowUp",
		moveDown: "Alt+ArrowDown",
		moveLeft: "Alt+ArrowLeft",
		moveRight: "Alt+ArrowRight",
	},
} as const;
