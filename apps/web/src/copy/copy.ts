import { modShortcut } from "@tabelo/ui/lib/platform";
import type { CopyScope } from "@/clipboard/serialize";
import { product } from "@/copy/product";
import { columnLetter } from "@/core/column-letter";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import type { FillSeriesRefusal } from "@/core/series";
import type { CellValueType, ExpectedColumnType } from "@/core/types";
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
const FIX_TABLE = "Fix table";

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
	string: "String",
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
		description:
			"A formatted table for pasting into Microsoft Word, Microsoft Teams, Slack, Google Docs, Gmail, and similar rich-text apps",
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
	return `This view cannot represent${subject}. Correct the table to use this view.`;
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
		description:
			"This clears the current table and any unfinished source edits.",
		confirm: "Start new table",
	},

	headerImport: {
		title: "Does row 1 contain headers?",
		description:
			"Choose whether row 1 names the columns or stays as the first data row.",
		asData: "Keep row 1 as data",
		asHeaders: "Use row 1 as headers",
	},

	appUpdate: {
		label: "Reload to update",
		description: "A new version of Tabelo is ready",
	},

	settings: {
		title: "Settings",
		description: "Choose display preferences for Tabelo",
		apply: "Apply settings",
		indicators: {
			label: "Source indicators",
			description: "Show what the text itself cannot",
		},
		spaceIndicators: {
			label: "Spaces",
			options: {
				none: { label: "Never", description: "Leave every space unmarked" },
				boundary: {
					label: "Around values",
					description: "Runs of spaces, and spaces at a line's edges",
				},
				trailing: {
					label: "At the end of a line",
					description: "The spaces nobody meant to type",
				},
				all: { label: "Always", description: "Every space in the source" },
			},
		},
		tabIndicators: {
			label: "Tabs",
			description: "The delimiter a TSV row is built from",
		},
		emptyValueIndicators: {
			label: "Empty values",
			description: "A placeholder where a field holds nothing",
		},
		saveError:
			"Settings could not be saved. Allow browser storage or free some space, then try again.",
	},

	workspace: {
		layout: "Layout",
		layoutHint: "Choose how the open views are arranged",
		applyLayout: "Apply layout",
		changeView: "Change view",
		changeViewHint: (label: string) =>
			`Choose the view shown in the ${label} pane.`,
		movePane: "Move pane",
		movePaneHint: (label: string) => `Choose where to move the ${label} pane.`,
		moveDestination: "Pane position",
		destinationView: (label: string) => `Currently ${label}`,
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
		// Each field's label and its placeholder are the same word: the bar
		// floats over the table, so a visible label beside every control would
		// cost the rows underneath it for nothing a programmer needs told twice.
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
		noMatches: "No matches",
		replaced: (count: number) =>
			`${count} ${count === 1 ? "match" : "matches"} replaced.`,
		nothingReplaced: "Nothing was replaced.",
	},

	disabled: {
		inUseStatus: "In use",
		unavailableStatus: "Blocked",
		viewAlreadyOpen: (label: string) => `${label} is already open.`,
		chooseAvailableView: "Choose an available view first.",
		layoutAlreadyApplied: "This layout is already applied.",
		layoutOnlyArrangement:
			"This number of views has only one arrangement. Add or close a view to change it.",
		settingsAlreadyApplied: "These settings are already applied.",
		viewAlreadyShown: "This view is already shown in this pane.",
		zoomMinimum: "Zoom is already at 50%.",
		zoomDefault: "Zoom is already at 100%.",
		zoomMaximum: "Zoom is already at 200%.",
		closeOnlyView: "At least one view must stay open.",
		moveOnlyView: "Add another view before moving this pane.",
		chooseMoveDestination: "Choose an available pane position first.",
		addViewMaximum: "The maximum is four views.",
		undo: "There is nothing to undo.",
		redo: "There is nothing to redo.",
		fitWrappedColumn: "Turn off Wrap text to fit this column.",
		columnAlreadyFitted: "This column already fits its content.",
		columnFitUnavailable: "This column cannot be measured right now.",
		firstRow: "The selected row is already first.",
		lastRow: "The selected row is already last.",
		firstColumn: "The selected column is already first.",
		lastColumn: "The selected column is already last.",
		lastRemainingRow: "A table must keep at least one row.",
		lastRemainingColumn: "A table must keep at least one column.",
		headerRowRequired: "Every table keeps its header row.",
		// Inserting, moving, and pasting each need one place to act. A selection
		// holding several separate areas names several, so the action says so
		// rather than picking one of them.
		singleAreaRequired: "This needs one selected area, not several.",
		singleCellRequired: "Select one data cell to change its type.",
		noQuery: "Type something to find first.",
		// Both the step and the replace controls refuse for the same reason, so
		// they say the same thing rather than inventing two wordings for it.
		noMatchingCell: "No cell holds that text.",
		cellTypeConversion: (label: string) =>
			`This value cannot be converted to ${label.toLowerCase()}.`,
		updateInProgress: "The update is already being applied.",
		codecPrecondition: (failure: PreconditionFailure) =>
			preconditionMessage(failure),
	},

	source: {
		blocked: (failure: PreconditionFailure) => preconditionMessage(failure),
		// The placeholder standing where a delimited syntax hides an empty
		// field. Parenthesised so it reads as an annotation rather than as text
		// the user typed. Defined in the core because Markdown's serializer
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
				case "json-scalar-cells-required":
					message =
						"Every JSON cell must be a string, number, boolean, or null.";
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
		fill: "Fill",
		fillUp: "Fill up",
		fillDown: "Fill down",
		fillLeft: "Fill left",
		fillRight: "Fill right",
		alignLeft: "Align left",
		alignCenter: "Align center",
		alignRight: "Align right",
		alignDefault: "No alignment",
		alignment: "Alignment",
		expectedType: "Expected type",
		cellType: "Cell type",
		edit: "Edit",
		move: "Move",
		copy: "Copy",
		cut: "Cut",
		paste: "Paste",
		rowActions: "Row actions",
		columnActions: "Column actions",
		copySource: "Copy source",
		copyFormattedTable: "Copy rich-text table",
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
		selectRow: "Select row",
		selectColumn: "Select column",
		fitColumnToContent: "Fit column to content",
		wrapColumnText: "Wrap text",
		editHeader: "Rename column",
		// The command that sits beside a choice its codec has refused. The
		// refusal already says what is wrong; this takes the user to it.
		fixTable: FIX_TABLE,
	},

	typedEditing: {
		choiceTitle: "Choose how to store this value",
		choiceDescription: (
			type: ExpectedColumnType,
			input: string,
			converted: string,
		) =>
			`${JSON.stringify(input)} is valid ${expectedColumnTypeLabels[type].toLowerCase()} input. Converting it stores ${JSON.stringify(converted)}; keeping it as text preserves the exact entry.`,
		invalidTitle: "Value does not match the column type",
		invalidDescription: (type: ExpectedColumnType, input: string) =>
			`${JSON.stringify(input)} is not a valid ${expectedColumnTypeLabels[type].toLowerCase()}. Keep editing it or store it as text.`,
		keepEditing: "Keep editing",
		keepAsText: "Keep as text",
		changeToText: "Change to text",
		convertTo: (type: ExpectedColumnType) =>
			`Convert to ${expectedColumnTypeLabels[type]}`,
	},

	tableName: {
		label: "Table name",
		dialogTitle: "Rename table",
		description: "Choose the name used for this table and its downloads",
		confirm: "Rename",
		empty: "Enter a table name.",
		tooLong: "Use 120 characters or fewer.",
		unchanged: "Enter a different table name.",
		saveError: "The table name could not be saved. Try again.",
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
		previewTitle: "Nothing to read yet",
		previewBody: "Add a row to the table to see it rendered here.",
	},

	status: {
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
		loading: "Loading…",
	},

	notices: {
		pendingPaneAction: (kind: "view" | "close") =>
			kind === "close"
				? "This source is not valid yet. Keep editing or discard it to close the view."
				: "This source is not valid yet. Keep editing or discard it to change views.",
		discardPaneAction: (kind: "view" | "close") =>
			kind === "close" ? "Discard and close" : "Discard and change",
		importError: (error: ImportError) => {
			switch (error.code) {
				case "invalid-format":
					return `Not valid ${views[error.format].shortLabel}. Your table is unchanged.`;
				case "too-many-rows":
					return `${error.actual} rows, over the ${error.limit} limit. Remove rows and try again. Your table is unchanged.`;
				case "too-many-columns":
					return `${error.actual} columns, over the ${error.limit} limit. Remove columns and try again. Your table is unchanged.`;
				case "too-many-cells":
					return `${error.actual} cells, over the ${error.limit} limit. Reduce the table and try again. Your table is unchanged.`;
				case "payload-too-large":
					return "Over the 1 MB limit. Use less data and try again. Your table is unchanged.";
				case "empty":
					return "Nothing to import. Your table is unchanged.";
			}
		},
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
		imported: "Table imported",
		storageUnavailable:
			"Browser storage is unavailable. Download a copy before closing.",
		storageQuota: "Browser storage is full. Download a copy before closing.",
		savedTableUnreadable:
			"The saved table could not be opened. The original data was kept.",
		storageRecoveryUnavailable: "No recovery copy: storage is unavailable.",
		storageRecoveryQuota: "No recovery copy: storage is full.",
		// The fill already happened and the table is correct as it stands. This
		// offers the other reading of the same selection; it never says the
		// repeat was a mistake.
		fillSeriesOffer:
			"The selected numbers were repeated. Continue them instead?",
		fillSeries: "Fill series",
		keepCopiedValues: "Keep copied values",
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
		columnWithExpectedType: (
			header: string,
			column: number,
			type: ExpectedColumnType,
		) =>
			`${header.trim() === "" ? columnLetter(column) : header}, Expected type ${expectedColumnTypeLabels[type].toLowerCase()}`,
		realCellType: (type: CellValueType) =>
			`Type ${cellTypeLabels[type].toLowerCase()}`,
		expectedColumnType: (type: ExpectedColumnType) =>
			`Expected type ${expectedColumnTypeLabels[type].toLowerCase()}`,
		// The editor that opens inside a cell is a control, not a cell, so it
		// names itself by position rather than borrowing the cell's value.
		cellEditor: (row: number, column: number) =>
			`Row ${row + 2}, column ${column + 1}`,
		headerEditor: (header: string, column: number) =>
			`Rename ${header.trim() === "" ? `column ${columnLetter(column)}` : header}`,
		// A list can refuse more than one choice at a time, and every recovery
		// command in it reads "Fix table". The refused choice is what tells them
		// apart, so it opens the accessible name while the visible label stays
		// inside it.
		fixTableFor: (label: string) => `${FIX_TABLE} for ${label}`,
		sourceEditor: (format: string) => `${format} source`,
		preview: "Rendered table preview",
		blockedView: "Blocked view reason",
		selectionSummary: (rows: number, columns: number) =>
			rows === 1 && columns === 1
				? "1 cell selected"
				: `${rows} × ${columns} cells selected`,
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
		fillHandleHint:
			"Drag to repeat the selection, or use Mod+Alt with an arrow key.",
	},

	shortcuts: {
		find: "Mod+F",
		undo: "Mod+Z",
		redo: "Mod+Shift+Z",
		addRow: "Mod+Enter",
		edit: "Enter",
		clear: "Backspace",
		deleteStructure: "Mod+Backspace",
		copy: "Mod+C",
		cut: "Mod+X",
		paste: "Mod+V",
		// Alt keeps these clear of Mod+plus, Mod+minus, and Mod+0, which belong to
		// the browser and stay the way to scale the whole interface.
		zoomOut: "Mod+Alt+-",
		resetZoom: "Mod+Alt+0",
		zoomIn: "Mod+Alt++",
		editHeader: "F2",
		// The keyboard equal of a modifier click. Ctrl is the modifier that
		// reaches the page on every platform: macOS keeps Cmd+Space for itself.
		toggleColumn: "Ctrl+Space",
		toggleRow: "Ctrl+Shift+Space",
		fillUp: "Mod+Alt+↑",
		fillDown: "Mod+Alt+↓",
		fillLeft: "Mod+Alt+←",
		fillRight: "Mod+Alt+→",
	},
} as const;
