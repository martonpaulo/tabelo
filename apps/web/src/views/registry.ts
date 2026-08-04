import {
	Braces,
	Code2,
	Eye,
	FileText,
	List,
	Sheet,
	Table2,
	Tags,
} from "lucide-react";
import { copy } from "@/copy/copy";
import {
	csvCodec,
	htmlCodec,
	jiraCodec,
	jsonCodec,
	markdownCodec,
	recordsCodec,
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
		...copy.views.grid,
		icon: Table2,
		kind: "grid",
		highlight: "plain",
		capabilities: gridCapabilities,
	},

	markdown: {
		id: "markdown",
		...copy.views.markdown,
		icon: FileText,
		kind: "source",
		codec: markdownCodec,
		highlight: "markdown",
		capabilities: sourceCapabilities,
	},

	csv: {
		id: "csv",
		...copy.views.csv,
		icon: Sheet,
		kind: "source",
		codec: csvCodec,
		highlight: "delimited",
		capabilities: sourceCapabilities,
	},

	tsv: {
		id: "tsv",
		...copy.views.tsv,
		icon: Sheet,
		kind: "source",
		codec: tsvCodec,
		highlight: "delimited",
		capabilities: sourceCapabilities,
	},

	html: {
		id: "html",
		...copy.views.html,
		icon: Code2,
		kind: "source",
		codec: htmlCodec,
		highlight: "html",
		capabilities: sourceCapabilities,
	},

	jira: {
		id: "jira",
		...copy.views.jira,
		icon: Tags,
		kind: "source",
		codec: jiraCodec,
		highlight: "jira",
		capabilities: sourceCapabilities,
	},

	json: {
		id: "json",
		...copy.views.json,
		icon: Braces,
		kind: "source",
		codec: jsonCodec,
		highlight: "json",
		capabilities: sourceCapabilities,
	},

	records: {
		id: "records",
		...copy.views.records,
		icon: List,
		kind: "source",
		codec: recordsCodec,
		highlight: "records",
		capabilities: sourceCapabilities,
	},

	"html-preview": {
		id: "html-preview",
		...copy.views["html-preview"],
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
			structuredClipboard: true,
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
	"json",
	"records",
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
