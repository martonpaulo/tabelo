import { Code2, Eye, FileText, Sheet, Table2, Tags } from "lucide-react";
import {
	csvCodec,
	htmlCodec,
	jiraCodec,
	markdownCodec,
	tsvCodec,
} from "@/formats";
import type { ViewDefinition, ViewId } from "./types";

// Every view the workspace can show, described by capability rather than by
// name. Nothing outside this file enumerates formats: the workspace, the pane
// header, the download menu, and the clipboard all ask the registry.
// See docs/adr/0005.

const gridCapabilities = {
	editable: true,
	syntaxHighlighting: false,
	downloadable: false,
	structuredClipboard: true,
	textClipboard: false,
	tableOperations: true,
} as const;

const sourceCapabilities = {
	editable: true,
	syntaxHighlighting: true,
	downloadable: true,
	structuredClipboard: false,
	textClipboard: true,
	tableOperations: false,
} as const;

const readOnlySourceCapabilities = {
	...sourceCapabilities,
	editable: false,
} as const;

const registry: Record<ViewId, ViewDefinition> = {
	grid: {
		id: "grid",
		label: "Visual table",
		shortLabel: "Table",
		description: "Edit cells, rows, and columns directly.",
		icon: Table2,
		kind: "grid",
		highlight: "plain",
		capabilities: gridCapabilities,
	},

	markdown: {
		id: "markdown",
		label: "Markdown",
		shortLabel: "Markdown",
		description: "A Markdown table, alignment included.",
		icon: FileText,
		kind: "source",
		codec: markdownCodec,
		highlight: "markdown",
		capabilities: sourceCapabilities,
	},

	csv: {
		id: "csv",
		label: "CSV",
		shortLabel: "CSV",
		description: "Comma-separated values.",
		icon: Sheet,
		kind: "source",
		codec: csvCodec,
		highlight: "delimited",
		capabilities: sourceCapabilities,
	},

	tsv: {
		id: "tsv",
		label: "TSV",
		shortLabel: "TSV",
		description: "Tab-separated values, what spreadsheets paste.",
		icon: Sheet,
		kind: "source",
		codec: tsvCodec,
		highlight: "delimited",
		capabilities: sourceCapabilities,
	},

	html: {
		id: "html",
		label: "HTML source",
		shortLabel: "HTML",
		description: "A table element you can paste into a page.",
		icon: Code2,
		kind: "source",
		codec: htmlCodec,
		highlight: "html",
		capabilities: sourceCapabilities,
	},

	jira: {
		id: "jira",
		label: "Jira",
		shortLabel: "Jira",
		description: "Jira wiki table syntax.",
		icon: Tags,
		kind: "source",
		codec: jiraCodec,
		highlight: "plain",
		capabilities: sourceCapabilities,
	},

	"html-preview": {
		id: "html-preview",
		label: "Rendered preview",
		shortLabel: "Preview",
		description: "The table as a reader would see it.",
		icon: Eye,
		kind: "preview",
		// Borrows the HTML codec to serialize for download; it never parses,
		// which is what makes this view read-only.
		codec: htmlCodec,
		highlight: "plain",
		capabilities: {
			...readOnlySourceCapabilities,
			syntaxHighlighting: false,
			textClipboard: false,
		},
	},
};

// Presentation order wherever views are offered.
export const viewOrder: readonly ViewId[] = [
	"grid",
	"markdown",
	"csv",
	"tsv",
	"html",
	"html-preview",
	"jira",
];

export function getView(id: ViewId): ViewDefinition {
	return registry[id];
}

export function listViews(): readonly ViewDefinition[] {
	return viewOrder.map((id) => registry[id]);
}

export function isViewId(value: unknown): value is ViewId {
	return typeof value === "string" && value in registry;
}
