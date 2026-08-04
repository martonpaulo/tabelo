import type { LucideIcon } from "lucide-react";
import type { CodecId, TableCodec } from "@/formats/types";

export type ViewId = "grid" | CodecId | "html-preview";

// How a view presents the table, which decides how the workspace renders it and
// which clipboard behaviour applies.
export type ViewKind = "grid" | "source" | "preview";

// Which highlighting the source editor loads. Kept as a name rather than a
// CodeMirror extension so the registry stays free of editor imports and the
// editor itself can be lazy-loaded.
export type HighlightLanguage =
	| "markdown"
	| "delimited"
	| "html"
	| "jira"
	| "json"
	| "records"
	| "plain";

export interface ViewCapabilities {
	// Can the user change the table from inside this view?
	readonly editable: boolean;
	// Does the view offer syntax highlighting?
	readonly syntaxHighlighting: boolean;
	// Can the table be downloaded in this view's format?
	readonly downloadable: boolean;
	// Cell, row, and column clipboard operations over a selection.
	readonly structuredClipboard: boolean;
	// Ordinary text-editor clipboard behaviour, left to the editor.
	readonly textClipboard: boolean;
	// Do row and column operations apply while this view has focus?
	readonly tableOperations: boolean;
}

export interface ViewDefinition {
	readonly id: ViewId;
	readonly label: string;
	// Used where space is tight, such as a pane header on a narrow slot.
	readonly shortLabel: string;
	readonly description: string;
	readonly icon: LucideIcon;
	readonly kind: ViewKind;
	// Present for every view that reads or writes a text format. The grid has
	// none; the rendered preview borrows the HTML codec to serialize only.
	readonly codec?: TableCodec;
	readonly highlight: HighlightLanguage;
	readonly capabilities: ViewCapabilities;
}

export function isSourceView(view: ViewDefinition): boolean {
	return view.kind === "source";
}

// Read-only is a property of the view, not of the codec: the rendered preview
// borrows the HTML codec but never writes back through it.
export function canParse(view: ViewDefinition): boolean {
	return view.capabilities.editable && view.codec !== undefined;
}
