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
		chooseView: "Choose view",
		activePane: "Active pane",
		resizeColumns: "Resize columns",
		resizeRows: "Resize rows",
		readOnly: "Read-only",
	},

	status: {
		synced: "In sync",
		syncedHint: "Every view matches the table.",
		typing: "Editing",
		typingHint: "Waiting for you to pause before reading this back.",
		invalid: "Not valid yet",
		invalidHint: "The table still shows your last working version.",
	},

	actions: {
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
		download: "Download",
		downloadAs: "Download as",
		importFile: "Import file",
		newTable: "New table",
		selectRow: "Select row",
		selectColumn: "Select column",
		resizeColumn: "Resize column",
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
		headerGuess: "Tabelo used the first row as column headers.",
		headerGuessAction: "First row is data",
		copied: "Copied to the clipboard.",
		sourceCopied: "Source copied to the clipboard.",
		imported: "Table imported.",
		storageUnavailable: "Changes are not being saved.",
		storageUnavailableHint:
			"Browser storage is unavailable, so this table will be lost when you close the tab.",
		savedTableUnreadable: "The saved table could not be read.",
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
