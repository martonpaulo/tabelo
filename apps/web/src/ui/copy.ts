// Every user-visible string lives here. One place to keep the voice
// consistent, and the seam a locale would plug into if Tabelo ever ships one.
// Keep the tone plain and calm: say what happened, not how clever the app is.

export const copy = {
	app: {
		name: "Tabelo",
		tagline: "Edit a table visually, as Markdown, or as CSV.",
	},

	panels: {
		tableTitle: "Table",
		sourceTitle: "Source",
		showSource: "Show source panel",
		hideSource: "Hide source panel",
	},

	format: {
		markdown: "Markdown",
		csv: "CSV",
		switchLabel: "Source format",
	},

	status: {
		synced: "In sync",
		syncedHint: "The table and the source match.",
		typing: "Editing",
		typingHint: "Waiting for you to pause before reading this back.",
		invalid: "Not valid yet",
		invalidHint: "The table below still shows your last working version.",
	},

	actions: {
		undo: "Undo",
		redo: "Redo",
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
		copySource: "Copy source",
		download: "Download",
		importFile: "Import file",
		newTable: "New table",
		selectRow: "Select row",
		selectColumn: "Select column",
		resizeColumn: "Resize column",
	},

	empty: {
		title: "Start with an empty table",
		body: "Type in any cell, or paste a table from a spreadsheet, a web page, Markdown, or CSV.",
		pasteHint: "Paste to fill the table",
		importAction: "Import a file",
	},

	notices: {
		headerGuess: "Tabelo used the first row as column headers.",
		headerGuessAction: "First row is data",
		copied: "Copied to the clipboard.",
		sourceCopied: "Source copied to the clipboard.",
		downloaded: "File downloaded.",
		imported: "Table imported.",
		restored: "Restored your last table.",
		storageUnavailable: "Changes are not being saved.",
		storageUnavailableHint:
			"Browser storage is unavailable, so this table will be lost when you close the tab.",
		savedTableUnreadable: "The saved table could not be read.",
		savedTableUnreadableHint:
			"Starting fresh. The stored copy was left untouched.",
	},

	a11y: {
		grid: "Table editor",
		rowNumber: (index: number) => `Row ${index + 1}`,
		columnLetter: (index: number) => `Column ${index + 1}`,
		cell: (row: number, column: number) =>
			`Row ${row + 1}, column ${column + 1}`,
		headerCell: (column: number) => `Header for column ${column + 1}`,
		sourceEditor: (format: string) => `${format} source`,
		selectionSummary: (rows: number, columns: number) =>
			rows === 1 && columns === 1
				? "1 cell selected"
				: `${rows} × ${columns} cells selected`,
	},

	shortcuts: {
		undo: "Mod+Z",
		redo: "Mod+Shift+Z",
		addRow: "Mod+Enter",
		addColumn: "Mod+Shift+Enter",
		edit: "Enter",
		clear: "Delete",
	},
} as const;
