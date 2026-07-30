import { defaultHeader } from "@/core/document";
import type { ParseIssue, PreconditionFailure } from "@/formats/types";
import type { ImportError } from "@/import/prepare";
import { product } from "@/product";

// Every user-visible string lives here. One place to keep the voice
// consistent, and the seam a locale would plug into if Tabelo ever ships one.
// Keep the tone plain and calm: say what happened, not how clever the app is.

const views = {
	grid: {
		label: "Visual table",
		shortLabel: "Table",
		description: "Edit cells, rows, and columns directly.",
	},
	markdown: {
		label: "Markdown",
		shortLabel: "Markdown",
		description: "A Markdown table, alignment included.",
	},
	csv: {
		label: "CSV",
		shortLabel: "CSV",
		description: "Comma-separated values.",
	},
	tsv: {
		label: "TSV",
		shortLabel: "TSV",
		description: "Tab-separated values, what spreadsheets paste.",
	},
	html: {
		label: "HTML source",
		shortLabel: "HTML",
		description: "A table element you can paste into a page.",
	},
	jira: {
		label: "Jira",
		shortLabel: "Jira",
		description: "Jira wiki table syntax.",
	},
	json: {
		label: "JSON",
		shortLabel: "JSON",
		description: "A JSON array of rows, with headers first.",
	},
	"html-preview": {
		label: "Rendered preview",
		shortLabel: "Preview",
		description: "The table as a reader would see it.",
	},
} as const;

function columnLetter(index: number): string {
	let value = index + 1;
	let result = "";
	while (value > 0) {
		value -= 1;
		result = String.fromCharCode(65 + (value % 26)) + result;
		value = Math.floor(value / 26);
	}
	return result;
}

function joinedPositions(values: readonly string[]): string {
	if (values.length <= 1) return values[0] ?? "";
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function preconditionMessage(failure: PreconditionFailure): string {
	const locations: string[] = [];
	if (failure.columns?.length) {
		const columns = failure.columns.map(columnLetter);
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
	return `This view cannot represent${subject}. Correct the table to use this view.`;
}

export const copy = {
	app: product,

	views,

	layouts: {
		columns: { label: "Two columns", description: "Side by side." },
		rows: { label: "Two rows", description: "Stacked." },
		"left-split": {
			label: "Split left",
			description: "Two stacked on the left, one tall on the right.",
		},
		"right-split": {
			label: "Split right",
			description: "One tall on the left, two stacked on the right.",
		},
		"top-split": {
			label: "Split top",
			description: "Two across the top, one wide below.",
		},
		"bottom-split": {
			label: "Split bottom",
			description: "One wide on top, two across the bottom.",
		},
		quad: { label: "Four panes", description: "All four views at once." },
	},

	newTable: {
		title: "Start a new table?",
		description:
			"This clears the current table and any unfinished source edits.",
		confirm: "Start new table",
	},

	appUpdate: {
		label: "Reload to update",
		description: "A new version of Tabelo is ready.",
	},

	workspace: {
		layout: "Layout",
		layoutHint: "Choose how the workspace is divided.",
		changeView: "Change view",
		addView: "Add view",
		closeView: "Close view",
		pane: "Pane",
		paneActions: "Pane actions",
		readOnly: "Read only",
		activePane: "Active pane",
		resizeColumns: "Resize columns",
		resizeRows: "Resize rows",
		zoom: (percent: number) => `Zoom ${percent}%`,
		zoomOut: "Zoom out",
		zoomIn: "Zoom in",
		resetZoom: "Reset zoom",
	},

	disabled: {
		viewAlreadyOpen: (label: string) => `${label} is already open.`,
		zoomMinimum: "Zoom is already at 50%.",
		zoomDefault: "Zoom is already at 100%.",
		zoomMaximum: "Zoom is already at 200%.",
		addViewLimit: "The current layout already has four views.",
		closeOnlyView: "At least two views must stay open.",
		undo: "There is nothing to undo.",
		redo: "There is nothing to redo.",
		minimumColumnWidth: "This column is already at its minimum width.",
		defaultColumnWidth: "This column already uses the default width.",
		firstRow: "The selected row is already first.",
		lastRow: "The selected row is already last.",
		firstColumn: "The selected column is already first.",
		lastColumn: "The selected column is already last.",
		lastRemainingRow: "A table must keep at least one row.",
		lastRemainingColumn: "A table must keep at least one column.",
		updateInProgress: "The update is already being applied.",
		codecPrecondition: (failure: PreconditionFailure) =>
			preconditionMessage(failure),
	},

	source: {
		blocked: (failure: PreconditionFailure) => preconditionMessage(failure),
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
					message = "HTML cannot be read in this environment.";
					break;
				case "html-table-required":
					message =
						"No <table> found yet. A table needs rows of <th> or <td> cells.";
					break;
				case "json-invalid":
					message = "This is not valid JSON yet.";
					break;
				case "json-rows-required":
					message = "JSON must be a non-empty array of rows.";
					break;
				case "json-row-array-required":
					message = "Each JSON row must be an array.";
					break;
				case "json-header-required":
					message = "The first JSON row must contain at least one header.";
					break;
				case "json-string-cells-required":
					message = "Every JSON cell must be a string.";
					break;
				case "delimited-unclosed-quote":
					message = "A quoted field is not closed.";
					break;
				case "delimited-invalid-quote":
					message = "A quoted field contains an unexpected quote.";
					break;
				case "delimited-delimiter-undetected":
					message = "The column separator could not be detected.";
					break;
				case "delimited-field-count":
					message = "This row has a different number of fields.";
					break;
				case "delimited-parse-error":
					message = "This source could not be read yet.";
					break;
			}
			return issue.line === undefined
				? message
				: `Line ${issue.line}: ${message}`;
		},
	},

	actions: {
		openAppMenu: "Open Tabelo menu",
		openAppMenuWithUpdate: "Open Tabelo menu, update available",
		github: "View on GitHub",
		dismiss: "Dismiss",
		undo: "Undo",
		redo: "Redo",
		insertRowsAbove: (count: number) =>
			`Insert ${count === 1 ? "row" : "rows"} above`,
		insertRowsBelow: (count: number) =>
			`Insert ${count === 1 ? "row" : "rows"} below`,
		insertColumnsLeft: (count: number) =>
			`Insert ${count === 1 ? "column" : "columns"} left`,
		insertColumnsRight: (count: number) =>
			`Insert ${count === 1 ? "column" : "columns"} right`,
		addRow: "Add row",
		addColumn: "Add column",
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
		alignLeft: "Align left",
		alignCenter: "Align center",
		alignRight: "Align right",
		alignDefault: "No alignment",
		alignment: "Alignment",
		copy: "Copy",
		cut: "Cut",
		paste: "Paste",
		more: "More actions",
		rowActions: "Row actions",
		columnActions: "Column actions",
		copySource: "Copy source",
		downloadAs: "Download as",
		downloadTable: "Download table",
		download: "Download",
		cancel: "Cancel",
		importFile: "Import file",
		newTable: "New table",
		selectRow: "Select row",
		selectColumn: "Select column",
		resizeColumn: "Resize column",
		columnWidth: (rem: number) =>
			`Column width ${Number.parseFloat(rem.toFixed(2))} rem`,
		widenColumn: "Widen column",
		narrowColumn: "Narrow column",
		resetColumnWidth: "Reset column width",
		editHeader: "Rename column",
	},

	download: {
		title: "Download table",
		hint: "Choose a file format.",
		format: "File format",
		options: "Options",
		// Output-only choices, listed by the id the codec declares.
		option: (id: "includeHeader") =>
			id === "includeHeader" ? "Include header row" : id,
		optionHint: (id: "includeHeader") =>
			id === "includeHeader"
				? "The table always has a header row. This decides whether the file prints it."
				: "",
		invalidDraft:
			"This source is not valid yet. Download the last valid table or copy the draft.",
		copyDraft: "Copy the draft",
	},

	empty: {
		title: "Start with a table",
		body: "Use an empty table, paste from the clipboard, or import Markdown, CSV, TSV, HTML, Jira, or JSON.",
		emptyAction: "Use an empty table",
		pasteHint: "Paste a table",
		importAction: "Import a file",
		sourceTitle: "Nothing here yet",
		sourceBody: (label: string) => `Paste ${label} here to create the table.`,
	},

	status: {
		loading: "Loading…",
	},

	notices: {
		pendingPaneAction: (kind: "view" | "close") =>
			kind === "close"
				? "This source is not valid yet. Keep editing or discard it before closing this view."
				: "This source is not valid yet. Keep editing or discard it before changing views.",
		discardPaneAction: (kind: "view" | "close") =>
			kind === "close" ? "Discard and close view" : "Discard and change view",
		headerGuess: "First row used as headers.",
		headerGuessAction: "Use it as data instead",
		importError: (error: ImportError) => {
			switch (error.code) {
				case "invalid-format":
					return `This file is not valid ${views[error.format].shortLabel}. The current table was not changed.`;
				case "too-many-rows":
					return `This import has ${error.actual} rows, above Tabelo's supported limit of ${error.limit}. The current table was not changed.`;
				case "too-many-columns":
					return `This import has ${error.actual} columns, above Tabelo's supported limit of ${error.limit}. The current table was not changed.`;
				case "too-many-cells":
					return `This import has ${error.actual} cells, above Tabelo's supported limit of ${error.limit}. The current table was not changed.`;
				case "payload-too-large":
					return "This import is larger than Tabelo's supported limit of 1 MB. The current table was not changed.";
				case "empty":
					return "There is no table to import. The current table was not changed.";
			}
		},
		copied: (scope: "selection" | "source") =>
			scope === "source"
				? "Source copied to the clipboard."
				: "Copied to the clipboard.",
		// Tabelo cannot grant itself clipboard permission, so the recovery is
		// always the keyboard. It stays available because a trusted key press
		// never needs the permission the button does.
		clipboardReadFailed:
			"Clipboard access was blocked. Use ⌘V/Ctrl+V or allow clipboard access, then try again.",
		clipboardWriteFailed: (scope: "selection" | "source") =>
			scope === "source"
				? "The source could not be copied. Select it in the editor and use ⌘C/Ctrl+C."
				: "The selection could not be copied. Select it and use ⌘C/Ctrl+C.",
		clipboardEmpty: "There is nothing on the clipboard to paste.",
		imported: "Table imported.",
		storageUnavailable:
			"Changes are only in this tab. Browser storage is unavailable. Download a copy before closing.",
		storageQuota:
			"This table does not fit in browser storage. Download a copy before closing.",
		savedTableUnreadable:
			"The saved table could not be opened. Tabelo kept the original browser data unchanged.",
		storageRecoveryUnavailable:
			"A recovery copy could not be created because browser storage is unavailable.",
		storageRecoveryQuota:
			"A recovery copy could not be created because browser storage is full.",
		downloadCopy: "Download a copy",
		downloadOriginal: "Download original data",
		replaceSavedData: "Replace saved data",
		replacedSavedData:
			"Saved data replaced. The original was kept as a recovery copy.",
		updateCheckFailed:
			"Tabelo could not check for an update. Keep working and try again later.",
		updateFailed:
			"Tabelo could not apply the update. Your table is saved, so you can reload and try again.",
	},

	a11y: {
		grid: "Table editor",
		workspace: "Workspace",
		notices: "Notices",
		headerRow: "Row 1",
		pane: (label: string) => `${label} pane`,
		rowNumber: (index: number) => `Row ${index + 2}`,
		columnLetter: defaultHeader,
		// Header cells name themselves after what they contain, because that name
		// is what a screen reader reads out as the context for every cell beneath
		// or beside them. A column with an empty header falls back to its
		// position so the announcement is never silent.
		columnHeader: (header: string, column: number) =>
			header.trim() === "" ? defaultHeader(column) : header,
		// The editor that opens inside a cell is a control, not a cell, so it
		// names itself by position rather than borrowing the cell's value.
		cellEditor: (row: number, column: number) =>
			`Row ${row + 2}, column ${column + 1}`,
		headerEditor: (header: string, column: number) =>
			`Rename ${header.trim() === "" ? `column ${column + 1}` : header}`,
		sourceEditor: (format: string) => `${format} source`,
		preview: "Rendered table preview",
		blockedView: "Blocked view reason",
		selectionSummary: (rows: number, columns: number) =>
			rows === 1 && columns === 1
				? "1 cell selected"
				: `${rows} × ${columns} cells selected`,
	},

	shortcuts: {
		undo: "Mod+Z",
		redo: "Mod+Shift+Z",
		addRow: "Mod+Enter",
		edit: "Enter",
		clear: "Backspace",
		deleteStructure: "Mod+Backspace",
		copy: "Mod+C",
		cut: "Mod+X",
		paste: "Mod+V",
		zoomOut: "Mod+-",
		resetZoom: "Mod+0",
		zoomIn: "Mod++",
		editHeader: "F2",
	},
} as const;
