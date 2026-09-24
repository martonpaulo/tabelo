import type { TablerIcon } from "@tabler/icons-react";
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

// What Tab and Shift+Tab do inside a source editor (#54). Neither ever moves
// focus out of the pane: Escape is the exit.
//  - "next-field": move the caret to the next or previous field of the
//    format's own grammar, wrapping at the ends. The codec supplies the fields.
//  - "indent": indent or outdent by one unit, for formats that nest.
export type SourceTabBehaviour = "next-field" | "indent";

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
	// Supports structural row/column commands. Current caret, draft, selection,
	// and session state may still refuse a command; this is not admission.
	readonly tableOperations: boolean;
	// Tab inside this view's source editor. Null for a view with no source
	// editor, whose Tab belongs to its own keyboard model.
	readonly sourceTab: SourceTabBehaviour | null;
}

export interface ViewDefinition {
	readonly id: ViewId;
	// The view's one name, in Title Case, wherever it appears: the pane
	// header, every view chooser, and accessible names (owner, 2026-09-19).
	readonly label: string;
	readonly description: string;
	readonly icon: TablerIcon;
	readonly kind: ViewKind;
	// Present for every view that reads or writes a text format. The grid has
	// none; the rendered preview borrows the HTML codec to serialize only.
	readonly codec?: TableCodec;
	readonly highlight: HighlightLanguage;
	readonly capabilities: ViewCapabilities;
	// Whether the pane renderer code-splits this view behind a lazy import and
	// shows a loading state first, or renders it from the initial bundle. A
	// property the registry declares, not a branch the renderer takes on a
	// view's identity. See docs/adr/0005.
	readonly loading: "eager" | "lazy";
}

// Read-only is a property of the view, not of the codec: the rendered preview
// borrows the HTML codec but never writes back through it.
export function canParse(view: ViewDefinition): boolean {
	return view.capabilities.editable && view.codec !== undefined;
}

// Whether a text view aligns its columns on screen (#396): its codec maps
// where each row's cells sit, lays them out as columns across lines, and its
// own text does not already pad them.
export function alignsColumns(view: ViewDefinition): boolean {
	return (
		view.kind === "source" &&
		view.codec?.mapsSourceRows === true &&
		view.codec.mapsSourceColumns === true &&
		view.codec.padsColumns !== true
	);
}
