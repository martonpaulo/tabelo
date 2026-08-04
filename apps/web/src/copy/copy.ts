import { modShortcut } from "@tabelo/ui/lib/platform";
import { product } from "@/copy/product";
import type {
	OutputOptionId,
	ParseIssue,
	PreconditionFailure,
} from "@/formats/types";
import type { ImportError } from "@/import/prepare";
import type { SplitEdge } from "@/workspace/layout";

// Every user-visible string lives here. One place to keep the voice
// consistent, and the seam a locale would plug into if Tabelo ever ships one.
// Keep the tone plain and calm: say what happened, not how clever the app is.

const views = {
	grid: {
		label: "Visual table",
		shortLabel: "Table",
		description: "Edit cells, rows, and columns directly",
	},
	markdown: {
		label: "Markdown",
		shortLabel: "Markdown",
		description: "A Markdown table, alignment included",
	},
	csv: {
		label: "CSV",
		shortLabel: "CSV",
		description: "Comma-separated values",
	},
	tsv: {
		label: "TSV",
		shortLabel: "TSV",
		description: "Tab-separated values, what spreadsheets paste",
	},
	html: {
		label: "HTML source",
		shortLabel: "HTML",
		description: "A table element you can paste into a page",
	},
	jira: {
		label: "Jira",
		shortLabel: "Jira",
		description: "Jira wiki table syntax",
	},
	json: {
		label: "JSON",
		shortLabel: "JSON",
		description: "An array of rows, each one keyed by the headers",
	},
	records: {
		label: "Records",
		shortLabel: "Records",
		description: "Each row as a titled block of bullets",
	},
	"html-preview": {
		label: "Rendered preview",
		shortLabel: "Preview",
		description: "The table as a reader would see it",
	},
} as const;

// A column's positional name, in the spreadsheet sequence A..Z, AA, AB, and so
// on. This is the only identity an unnamed column has, so it is what the index
// strip displays and what an empty header announces.
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
	const columns = failure.columns?.map(columnLetter) ?? [];
	const columnSubject = columns.length
		? `${columns.length === 1 ? "column" : "columns"} ${joinedPositions(columns)}`
		: "the affected columns";

	switch (failure.code) {
		case "json-empty-header":
			return `JSON uses every header as an object key. Name ${columnSubject} to use this view.`;
		case "json-duplicate-header":
			return `JSON uses every header as a unique object key. Rename ${columnSubject} so no keys repeat.`;
		case "json-numeric-header":
			return `JSON reorders object keys written as whole numbers before other keys. Rename ${columnSubject} to preserve the table's column order.`;
		case "records-empty-first-header":
			return `Records titles every record with the first column's header. Name ${columnSubject} to use this view.`;
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
	return `This view cannot represent${subject}. Correct the table to use this view.`;
}

export const copy = {
	app: product,

	views,

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

	newTable: {
		title: "Start a new table?",
		description:
			"This clears the current table and any unfinished source edits.",
		confirm: "Start new table",
	},

	appUpdate: {
		label: "Reload to update",
		description: "A new version of Tabelo is ready",
	},

	workspace: {
		layout: "Layout",
		layoutHint: "Choose how the workspace is divided",
		applyLayout: "Apply layout",
		changeView: "Change view",
		changeViewHint: (label: string) =>
			`Choose the view shown in the ${label} pane.`,
		addView: "Add view",
		closeView: "Close view",
		paneActions: "Pane actions",
		readOnly: "Read only",
		activePane: "Active pane",
		resizeColumns: "Resize columns",
		resizeRows: "Resize rows",
		zoom: (percent: number) => `Zoom ${percent}%`,
		zoomOut: "Zoom out",
		zoomIn: "Zoom in",
		resetZoom: "Reset zoom",
		wrapSource: "Wrap lines",
	},

	disabled: {
		inUseStatus: "In use",
		unavailableStatus: "Blocked",
		viewAlreadyOpen: (label: string) => `${label} is already open.`,
		chooseAvailableView: "Choose an available view first.",
		layoutAlreadyApplied: "This layout is already applied.",
		viewAlreadyShown: "This view is already shown in this pane.",
		zoomMinimum: "Zoom is already at 50%.",
		zoomDefault: "Zoom is already at 100%.",
		zoomMaximum: "Zoom is already at 200%.",
		closeOnlyView: "At least one view must stay open.",
		addViewMaximum: "The maximum is four views.",
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
		headerRowRequired: "Every table keeps its header row.",
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
				case "json-row-object-required":
					message = "Each JSON row must be an object of column values.";
					break;
				case "json-header-required":
					message = "At least one JSON row must name a column.";
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
						"This bullet's header does not match a column from the first record.";
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
		rowActions: "Row actions",
		columnActions: "Column actions",
		copySource: "Copy source",
		copyFormattedTable: "Copy formatted table",
		downloadTable: "Download table",
		download: "Download",
		cancel: "Cancel",
		importFile: "Import file",
		newTable: "New table",
		selectRow: "Select row",
		selectColumn: "Select column",
		columnWidth: (rem: number) =>
			`Column width ${Number.parseFloat(rem.toFixed(2))} rem`,
		widenColumn: "Widen column",
		narrowColumn: "Narrow column",
		resetColumnWidth: "Reset column width",
		wrapColumnText: "Wrap text",
		editHeader: "Rename column",
	},

	addView: {
		title: "Add a view",
		// Says where the pane will land, because the control that opened this is
		// on one particular edge and the answer differs per edge.
		hint: (edge: SplitEdge, paneLabel: string) =>
			edge === "bottom"
				? `The new view opens below the ${paneLabel}.`
				: `The new view opens to the right of the ${paneLabel}.`,
		view: "View",
		confirm: "Add view",
	},

	download: {
		title: "Download table",
		hint: "Choose a file format",
		format: "File format",
		options: "Options",
		// Output-only choices, listed by the id the codec declares.
		option: (id: OutputOptionId) =>
			id === "includeHeader"
				? "Include header row"
				: id === "includeFirstColumnName"
					? "Include the first column name"
					: "Include empty values",
		optionHint: (id: OutputOptionId) =>
			id === "includeHeader"
				? "The table always has a header row. This decides whether the file prints it."
				: id === "includeFirstColumnName"
					? 'Each record title is prefixed with it, like "Product: Product A".'
					: "A field with no value prints an empty bullet instead of being left out.",
		invalidDraft:
			"This source is not valid yet. Download the last valid table or copy the draft.",
		copyDraft: "Copy the draft",
	},

	empty: {
		title: "Start with a table",
		body: "Use an empty table, paste from the clipboard, or import a table file.",
		emptyAction: "Use an empty table",
		pasteHint: "Paste a table",
		sourceTitle: "Nothing here yet",
		sourceBody: (label: string) => `Paste ${label} here to create the table.`,
	},

	status: {
		loading: "Loading…",
	},

	notices: {
		pendingPaneAction: (kind: "view" | "close") =>
			kind === "close"
				? "This source is not valid yet. Keep editing or discard it to close the view."
				: "This source is not valid yet. Keep editing or discard it to change views.",
		discardPaneAction: (kind: "view" | "close") =>
			kind === "close" ? "Discard and close" : "Discard and change",
		headerGuess: "First row used as headers",
		headerGuessAction: "Use as data",
		importError: (error: ImportError) => {
			switch (error.code) {
				case "invalid-format":
					return `Not valid ${views[error.format].shortLabel}. Your table is unchanged.`;
				case "too-many-rows":
					return `${error.actual} rows, over the ${error.limit} limit. Your table is unchanged.`;
				case "too-many-columns":
					return `${error.actual} columns, over the ${error.limit} limit. Your table is unchanged.`;
				case "too-many-cells":
					return `${error.actual} cells, over the ${error.limit} limit. Your table is unchanged.`;
				case "payload-too-large":
					return "Over the 1 MB limit. Your table is unchanged.";
				case "empty":
					return "Nothing to import. Your table is unchanged.";
			}
		},
		copied: (scope: "selection" | "source" | "preview") =>
			scope === "source"
				? "Source copied"
				: scope === "preview"
					? "Formatted table copied"
					: "Copied",
		// Tabelo cannot grant itself clipboard permission, so the recovery is
		// always the keyboard. It stays available because a trusted key press
		// never needs the permission the button does.
		// The app knows which keyboard the user has, so it names one key rather
		// than offering both spellings of the same shortcut.
		clipboardReadFailed: `Paste was blocked. Use ${modShortcut("V")} instead.`,
		clipboardWriteFailed: (scope: "selection" | "source" | "preview") =>
			scope === "source"
				? `Copy was blocked. Select the text and use ${modShortcut("C")}.`
				: scope === "preview"
					? `Copy was blocked. Select the table and use ${modShortcut("C")}.`
					: `Copy was blocked. Select the cells and use ${modShortcut("C")}.`,
		clipboardEmpty: "Nothing on the clipboard",
		imported: "Table imported",
		storageUnavailable:
			"Browser storage is unavailable. Download a copy before closing.",
		storageQuota: "Browser storage is full. Download a copy before closing.",
		savedTableUnreadable:
			"The saved table could not be opened. The original data was kept.",
		storageRecoveryUnavailable: "No recovery copy: storage is unavailable.",
		storageRecoveryQuota: "No recovery copy: storage is full.",
		downloadCopy: "Download a copy",
		downloadOriginal: "Download original",
		replaceSavedData: "Replace saved data",
		replacedSavedData: "Saved data replaced. The original was kept.",
		updateCheckFailed: "Could not check for an update. Try again later.",
		updateFailed: "Could not update. Reload and try again.",
	},

	a11y: {
		grid: "Table editor",
		workspace: "Workspace",
		notices: "Notices",
		headerRow: "Row 1",
		pane: (label: string) => `${label} pane`,
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
		columnLetter,
		// Header cells name themselves after what they contain, because that name
		// is what a screen reader reads out as the context for every cell beneath
		// or beside them. A column with an empty header falls back to its letter
		// from the index strip, so the announcement is never silent without
		// inventing content that would serialize into the document.
		columnHeader: (header: string, column: number) =>
			header.trim() === "" ? columnLetter(column) : header,
		// The editor that opens inside a cell is a control, not a cell, so it
		// names itself by position rather than borrowing the cell's value.
		cellEditor: (row: number, column: number) =>
			`Row ${row + 2}, column ${column + 1}`,
		headerEditor: (header: string, column: number) =>
			`Rename ${header.trim() === "" ? `column ${columnLetter(column)}` : header}`,
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
