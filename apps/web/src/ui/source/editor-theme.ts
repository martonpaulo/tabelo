import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// The editor is styled entirely from Tabelo's tokens so it stays part of the
// product rather than looking like an embedded IDE. Colour here is restrained
// on purpose: structure is emphasised, content is left alone.
// See docs/design-system.md §1.

// The source text is pane content, so it follows that pane's zoom. This is the
// same expression the `text-content` utility carries in index.css; CodeMirror
// styles come from a JS theme rather than a class, so the calc is repeated here
// instead of being reached through Tailwind.
const contentFontSize = "calc(var(--pane-zoom, 1) * 0.875rem)";

export const editorTheme = EditorView.theme({
	"&": {
		height: "100%",
		fontSize: contentFontSize,
		backgroundColor: "var(--surface-panel)",
		color: "var(--foreground)",
	},
	".cm-scroller": {
		fontFamily: "var(--font-family-source)",
		lineHeight: "1.6",
	},
	".cm-content": {
		padding: "calc(var(--spacing) * 3) 0",
		outline: "none",
		userSelect: "text",
	},
	".cm-line": { padding: "0 calc(var(--spacing) * 3)" },
	".cm-gutters": {
		backgroundColor: "var(--surface-gutter)",
		color: "var(--muted-foreground)",
		fontFamily: "var(--font-family-source)",
		fontSize: contentFontSize,
		lineHeight: "1.6",
		border: "none",
		borderRight: "0.0625rem solid var(--line-subtle)",
		userSelect: "none",
	},
	".cm-lineNumbers .cm-gutterElement": {
		padding: "0 calc(var(--spacing) * 2)",
		// Grows with the digits it holds, so a zoomed-in editor does not clip
		// three-figure line numbers.
		minWidth: "calc(var(--pane-zoom, 1) * 2.5rem)",
	},
	".cm-activeLine": { backgroundColor: "var(--active-line-fill)" },
	".cm-activeLineGutter": {
		backgroundColor: "var(--active-line-fill)",
		color: "var(--foreground)",
	},
	".cm-cursor, .cm-dropCursor": {
		borderLeft: "0.125rem solid var(--selection-edge)",
		height: "calc(var(--pane-zoom, 1) * 1.25rem) !important",
		marginLeft: "-0.0625rem",
		marginTop: "calc(var(--pane-zoom, 1) * -0.125rem)",
	},
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
		// CodeMirror's base theme uses a more specific light/dark selector for
		// this drawn layer. The product token must win because system theme, not
		// CodeMirror state, owns Tabelo's colour scheme.
		background: "var(--text-selection-fill) !important",
	},
	".cm-content ::selection": {
		backgroundColor: "var(--text-selection-fill)",
	},
	".cm-selectionMatch": { backgroundColor: "var(--text-selection-fill)" },
	".cm-tableHeaderLine": {
		backgroundColor: "var(--surface-header)",
		boxShadow: "inset 0 -0.0625rem 0 var(--line-strong)",
	},
	".cm-tableDelimiter": { color: "var(--muted-foreground)" },
	".cm-tableDivider": { color: "var(--selection-edge)" },
	".cm-diagnosticError": {
		textDecorationLine: "underline",
		textDecorationStyle: "wavy",
		textDecorationColor: "var(--destructive)",
		textDecorationThickness: "0.09375rem",
		textUnderlineOffset: "0.1875rem",
	},
	".cm-diagnosticWarning": {
		textDecorationLine: "underline",
		textDecorationStyle: "dotted",
		textDecorationColor: "var(--status-warning)",
		textDecorationThickness: "0.09375rem",
		textUnderlineOffset: "0.1875rem",
	},
	".cm-tooltip": {
		border: "0.0625rem solid var(--line-strong)",
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
	},
	".cm-diagnosticTooltip": {
		maxWidth: "20rem",
		padding: "calc(var(--spacing) * 2)",
		whiteSpace: "pre-line",
		fontFamily: "var(--font-sans)",
		fontSize: "0.75rem",
		lineHeight: "1.5",
	},
});

export const highlightStyle = HighlightStyle.define([
	// Table structure: the pipes, dividers, and delimiters that give the source
	// its shape. Dimmed so the data reads first.
	{ tag: tags.punctuation, color: "var(--muted-foreground)" },
	{ tag: tags.separator, color: "var(--muted-foreground)" },
	{ tag: tags.contentSeparator, color: "var(--selection-edge)" },
	// Header cells and anything the user marked up inside a cell.
	{ tag: tags.heading, color: "var(--foreground)", fontWeight: "600" },
	{ tag: tags.strong, fontWeight: "600" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{
		tag: tags.link,
		color: "var(--selection-edge)",
		textDecoration: "underline",
	},
	{ tag: tags.monospace, color: "var(--foreground)" },
	// Quoted CSV fields: the case where punctuation inside a value is data.
	{ tag: tags.string, color: "var(--selection-edge)" },
	{ tag: tags.escape, color: "var(--status-warning)" },
	{ tag: tags.tagName, color: "var(--selection-edge)" },
	{ tag: tags.attributeName, color: "var(--status-warning)" },
	{ tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
	{ tag: tags.invalid, color: "var(--destructive)" },
]);

export const syntaxTheme = [editorTheme, syntaxHighlighting(highlightStyle)];
