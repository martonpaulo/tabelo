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
	"&.cm-focused": {
		outline: "2px solid var(--selection-edge)",
		outlineOffset: "-2px",
	},
	".cm-scroller": {
		fontFamily: "var(--font-family-source)",
		lineHeight: "1.6",
	},
	".cm-content": { padding: "calc(var(--spacing) * 3) 0" },
	".cm-line": { padding: "0 calc(var(--spacing) * 3)" },
	".cm-gutters": {
		backgroundColor: "var(--surface-gutter)",
		color: "var(--muted-foreground)",
		border: "none",
		borderRight: "1px solid var(--line-subtle)",
	},
	".cm-lineNumbers .cm-gutterElement": {
		padding: "0 calc(var(--spacing) * 2)",
		// Grows with the digits it holds, so a zoomed-in editor does not clip
		// three-figure line numbers.
		minWidth: "calc(var(--pane-zoom, 1) * 2.5rem)",
	},
	".cm-activeLine": { backgroundColor: "var(--selection-fill)" },
	".cm-activeLineGutter": {
		backgroundColor: "var(--selection-fill)",
		color: "var(--foreground)",
	},
	".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
		{
			backgroundColor: "var(--selection-fill)",
		},
	".cm-selectionMatch": { backgroundColor: "var(--selection-fill)" },
	// The line the parser complained about, marked without moving anything.
	".cm-invalidLine": {
		backgroundColor: "color-mix(in oklch, var(--destructive), transparent 88%)",
		boxShadow: "inset 2px 0 0 var(--destructive)",
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
	// Quoted CSV fields — the case where punctuation inside a value is data.
	{ tag: tags.string, color: "var(--selection-edge)" },
	{ tag: tags.escape, color: "var(--status-pending)" },
	{ tag: tags.invalid, color: "var(--destructive)" },
]);

export const syntaxTheme = [editorTheme, syntaxHighlighting(highlightStyle)];
