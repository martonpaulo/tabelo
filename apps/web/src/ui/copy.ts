import type { ParseIssue } from "@/formats/types";
import type { ImportError } from "@/import/prepare";

// Every user-visible string lives here. One place to keep the voice
// consistent, and the seam a locale would plug into if Tabelo ever ships one.
// Keep the tone plain and calm: say what happened, not how clever the app is.

export const copy = {
	app: {
		name: "Tabelo",
		tagline: "Edit a table visually, as Markdown, or as CSV.",
	},

	workspace: {
		layout: "Layout",
		layoutHint: "Choose how the workspace is divided.",
		changeView: "Change view",
		addView: "Add view",
		closeView: "Close view",
		pane: "Pane",
		paneActions: "Pane actions",
		activePane: "Active pane",
		resizeColumns: "Resize columns",
		resizeRows: "Resize rows",
		zoom: (percent: number) => `Zoom ${percent}%`,
		zoomOut: "Zoom out",
		zoomIn: "Zoom in",
		resetZoom: "Reset zoom",
	},

	status: {
		invalid: "Not valid yet",
		invalidFeedback:
			"Source is not valid yet. Other views still show the last valid table.",
	},

	source: {
		details: "Details",
		showFeedback: (kind: "issue" | "warning", count: number) =>
			`Show ${count} ${kind}${count === 1 ? "" : "s"}`,
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
		file: "File",
		dismiss: "Dismiss",
		undo: "Undo",
		redo: "Redo",
		insertRowAbove: "Insert row above",
		insertRowBelow: "Insert row below",
		insertColumnLeft: "Insert column left",
		insertColumnRight: "Insert column right",
		addRow: "Add row",
		addColumn: "Add column",
		duplicate: "Duplicate",
		duplicateRows: "Duplicate rows",
		duplicateColumns: "Duplicate columns",
		deleteRows: "Delete rows",
		deleteColumns: "Delete columns",
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
		tableActions: "Table actions",
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
		title: "Start with an empty table",
		body: "Type in any cell, or paste a table from a spreadsheet, a web page, Markdown, CSV, TSV, or Jira.",
		pasteHint: "Paste to fill the table",
		importAction: "Import a file",
		sourceTitle: "Nothing here yet",
		sourceBody: (label: string) => `Paste ${label} here to create the table.`,
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
					return `This file is not valid ${error.format}. The current table was not changed.`;
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
		// always the keyboard — which stays available because a trusted key press
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
		updateReady: "An update is ready.",
		saveAndReload: "Save and reload",
		savingUpdate: "Saving…",
	},

	a11y: {
		grid: "Table editor",
		workspace: "Workspace",
		pane: (label: string) => `${label} pane`,
		rowNumber: (index: number) => `Row ${index + 1}`,
		columnLetter: (index: number) => `Column ${index + 1}`,
		cell: (row: number, column: number) =>
			`Row ${row + 1}, column ${column + 1}`,
		headerCell: (column: number) => `Header for column ${column + 1}`,
		sourceEditor: (format: string) => `${format} source`,
		preview: "Rendered table preview",
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
	},
} as const;
