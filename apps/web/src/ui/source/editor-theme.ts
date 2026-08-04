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
// The same tight text line-height the grid's cells use, so font size and line
// height match exactly everywhere and only the font family (and syntax colour)
// tells one view's text from another. Setting the full row height directly as
// line-height instead would centre the glyphs in an oversized line box, which
// is what made source text read as loosely spaced next to the grid.
const contentLineHeight = "calc(var(--pane-zoom, 1) * 1.25rem)";
// One whole row: the shared `--spacing-content-line-box` rhythm the grid's
// cells and the rendered preview's rows are also built from.
const contentLineBox = "calc(var(--pane-zoom, 1) * 2rem)";
// Split evenly above and below every line, the same way the rendered preview
// pads its rows, so each line's text keeps a normal, centred rhythm instead of
// hugging the top of an oversized box. Half of the gap between this line
// height and the shared `--spacing-content-line-box` row rhythm. This padding
// stays off the line-number gutter on purpose: CodeMirror recycles pooled
// line-number elements by collapsing them to zero height, and a nonzero
// padding would give every pooled copy real height again, turning it into a
// phantom row that pushes every real line number out of step with its own
// line and further out of step the more lines scroll past. The gutter shares
// only the tight line height below, which a pooled element's zero box ignores
// either way.
const contentLinePadding = "calc(var(--pane-zoom, 1) * 0.375rem)";

export const editorTheme = EditorView.theme({
	"&": {
		height: "100%",
		fontSize: contentFontSize,
		backgroundColor: "var(--surface-panel)",
		color: "var(--foreground)",
	},
	".cm-scroller": {
		fontFamily: "var(--font-family-source)",
		lineHeight: contentLineHeight,
		overscrollBehavior: "contain",
	},
	".cm-content": {
		// No top padding: the first line is the table's header row, so a gap above
		// it would separate table data from its pane. The bottom padding stays,
		// because it is the target for clicking below the last line to focus the
		// editor.
		padding: "0 0 calc(var(--spacing) * 3)",
		outline: "none",
		userSelect: "text",
	},
	".cm-line": {
		padding: `${contentLinePadding} calc(var(--spacing) * 3)`,
	},
	".cm-gutters": {
		backgroundColor: "var(--surface-gutter)",
		color: "var(--muted-foreground)",
		fontFamily: "var(--font-family-index)",
		fontSize: contentFontSize,
		// The whole row's height, not the tight text line height the content
		// uses. Two things depend on it. A line number then centres inside the
		// same row box its line's padded text centres in, instead of sitting a
		// half-gap high; and the element's natural height already equals a line
		// block, so the numbers line up during the first paint rather than
		// drifting upward until CodeMirror's own measurement pass replaces
		// their heights, which is not guaranteed to have run before the editor
		// is first shown.
		lineHeight: contentLineBox,
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
		backgroundColor: "var(--surface-table-header)",
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
	// A diagnostic is a product message, not editor chrome, so it wears the
	// product tooltip: same surface, boundary, radius, shadow, padding, type
	// size, and pointer. The values are repeated here rather than shared,
	// because CodeMirror is styled from a JavaScript theme that Tailwind never
	// sees. Keep them in step with `packages/ui/src/components/tooltip.tsx`.
	".cm-tooltip": {
		border: "0.0625rem solid var(--line-floating)",
		borderRadius: "var(--control-radius)",
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
		boxShadow: "0 1.25rem 1.5625rem -0.3125rem rgb(0 0 0 / 10%)",
	},
	// CodeMirror draws its pointer as two stacked triangles, one for the
	// boundary and one for the surface. The product pointer is the same shape
	// in the same two colours.
	".cm-tooltip .cm-tooltip-arrow:before": {
		borderTopColor: "var(--line-floating)",
		borderBottomColor: "var(--line-floating)",
	},
	".cm-tooltip .cm-tooltip-arrow:after": {
		borderTopColor: "var(--popover)",
		borderBottomColor: "var(--popover)",
	},
	".cm-diagnosticTooltip": {
		maxWidth: "20rem",
		padding: "calc(var(--spacing) * 1.5) calc(var(--spacing) * 3)",
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
