import {
	IconEye,
	IconFileCode2,
	IconFileDescription,
	IconFileSpreadsheet,
	IconFileTypeCsv,
	IconFileTypeHtml,
	IconFileTypeTxt,
	IconFileTypography,
	IconTable,
} from "@tabler/icons-react";
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
import { canParse, type ViewDefinition, type ViewId } from "./types";

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
	sourceTab: null,
} as const;

const sourceCapabilities = {
	editable: true,
	syntaxHighlighting: true,
	downloadable: true,
	structuredClipboard: false,
	textClipboard: true,
	tableOperations: false,
} as const;

// Formats that are a grid of delimited fields move between fields on Tab, and
// formats that nest indent. See SourceTabBehaviour.
const fieldSourceCapabilities = {
	...sourceCapabilities,
	sourceTab: "next-field",
} as const;

const nestedSourceCapabilities = {
	...sourceCapabilities,
	sourceTab: "indent",
} as const;

const readOnlySourceCapabilities = {
	...sourceCapabilities,
	editable: false,
	sourceTab: null,
} as const;

// One icon family (owner, 2026-09-19): every text view is a file, so it wears
// a Tabler file icon with its format's mark; the grid and the preview, which
// are not files, keep their own shapes. See docs/design-system.md section 6.
// Exported for the test that keeps `viewOrder` naming every entry: the type
// makes this map exhaustive, and nothing else may enumerate views.
export const registry: Record<ViewId, ViewDefinition> = {
	grid: {
		id: "grid",
		...copy.views.grid,
		icon: IconTable,
		kind: "grid",
		highlight: "plain",
		capabilities: gridCapabilities,
		// The grid is the view almost every workspace opens with, and it is the
		// one place column widths are measured rather than styled. It stays
		// eager by product decision, not pending a bundle-size measurement.
		loading: "eager",
	},

	markdown: {
		id: "markdown",
		...copy.views.markdown,
		icon: IconFileTypography,
		kind: "source",
		codec: markdownCodec,
		highlight: "markdown",
		capabilities: fieldSourceCapabilities,
		// Every source view shares one lazily loaded CodeMirror bundle.
		loading: "lazy",
	},

	csv: {
		id: "csv",
		...copy.views.csv,
		icon: IconFileTypeCsv,
		kind: "source",
		codec: csvCodec,
		highlight: "delimited",
		capabilities: fieldSourceCapabilities,
		loading: "lazy",
	},

	tsv: {
		id: "tsv",
		...copy.views.tsv,
		icon: IconFileSpreadsheet,
		kind: "source",
		codec: tsvCodec,
		highlight: "delimited",
		capabilities: fieldSourceCapabilities,
		loading: "lazy",
	},

	html: {
		id: "html",
		...copy.views.html,
		icon: IconFileTypeHtml,
		kind: "source",
		codec: htmlCodec,
		highlight: "html",
		capabilities: nestedSourceCapabilities,
		loading: "lazy",
	},

	jira: {
		id: "jira",
		...copy.views.jira,
		icon: IconFileTypeTxt,
		kind: "source",
		codec: jiraCodec,
		highlight: "jira",
		capabilities: fieldSourceCapabilities,
		loading: "lazy",
	},

	json: {
		id: "json",
		...copy.views.json,
		icon: IconFileCode2,
		kind: "source",
		codec: jsonCodec,
		highlight: "json",
		capabilities: nestedSourceCapabilities,
		loading: "lazy",
	},

	records: {
		id: "records",
		...copy.views.records,
		icon: IconFileDescription,
		kind: "source",
		codec: recordsCodec,
		highlight: "records",
		capabilities: fieldSourceCapabilities,
		loading: "lazy",
	},

	"html-preview": {
		id: "html-preview",
		...copy.views["html-preview"],
		icon: IconEye,
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
		loading: "lazy",
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

// The editable view that reads and writes a given format, which is how an
// imported or pasted source becomes something the workspace can open. Only a
// view that parses qualifies, so HTML content resolves to the HTML source
// rather than the rendered preview even though both borrow the same codec.
// Content no codec owns, such as plain text or Tabelo's own clipboard payload,
// resolves to nothing: there is no view of it to open.
export function editableViewForCodec(codecId: string): ViewDefinition | null {
	return (
		listViews().find((view) => canParse(view) && view.codec?.id === codecId) ??
		null
	);
}
