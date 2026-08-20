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
// One whole row of the shared `--spacing-content-line-box` rhythm the grid's
// cells and the rendered preview's rows are built from, carried as a line
// height so the text centres inside it exactly as a table cell's text centres
// in its own row. The content and the line-number gutter both use it, which is
// what keeps a number level with its line without either side depending on a
// measurement pass having already run.
const contentLineBox = "calc(var(--pane-zoom, 1) * 2rem)";

// What a header cell looks like in every source view. Formats whose grammar
// marks its header cells reach this through the `heading` tag below; HTML
// reaches it through a decoration class, because the HTML mode marks no header.
// Weight, not colour, carries the distinction, so the header stays legible in
// forced-colour mode and to anyone who cannot separate the two tones.
const headerCellStyle = { color: "var(--foreground)", fontWeight: "600" };

export const editorTheme = EditorView.theme({
	"&": {
		height: "100%",
		fontSize: contentFontSize,
		backgroundColor: "var(--surface-panel)",
		color: "var(--foreground)",
	},
	".cm-scroller": {
		fontFamily: "var(--font-family-source)",
		lineHeight: contentLineBox,
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
	// Horizontal only. A source line's vertical rhythm has to come from the
	// line height above, never from padding here: the app's base reset zeroes
	// padding on this element with a precedence a theme rule does not beat, so
	// a vertical value written here is silently dropped and the numbers beside
	// it end up measuring a different row than the text does.
	".cm-line": { padding: "0 calc(var(--spacing) * 3)" },
	".cm-gutters": {
		backgroundColor: "var(--surface-gutter)",
		color: "var(--muted-foreground)",
		fontFamily: "var(--font-family-index)",
		fontSize: contentFontSize,
		// The same row box the content uses, so a number's natural height
		// already equals the line block beside it. The numbers are then level
		// from the first paint, rather than drifting until CodeMirror's own
		// measurement pass replaces their heights, which is not guaranteed to
		// have run before the editor is first shown.
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
	// HTML is the one format whose header cells no grammar marks for us, so the
	// project-owned decorator in html-language.ts supplies them. It wears the
	// same treatment the `heading` tag carries everywhere else, from the same
	// definition, so there is one owner for what a header cell looks like.
	".cm-tableHeaderCell": headerCellStyle,
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
	// Table structure: the brackets, pipes, dividers, and markup markers that
	// give the source its shape. Dimmed so the data reads first. `punctuation`
	// is the parent of every bracket tag, so JSON's braces and square brackets
	// and HTML's angle brackets are all covered by that one entry.
	{ tag: tags.punctuation, color: "var(--muted-foreground)" },
	{ tag: tags.separator, color: "var(--muted-foreground)" },
	// Markdown's own markers: the pipes of a table row, the alignment divider
	// under the header, and the `#`, `*`, `>`, and `-` that open a construct.
	// The divider is structure like any other delimiter and recedes with them.
	{ tag: tags.processingInstruction, color: "var(--muted-foreground)" },
	{ tag: tags.contentSeparator, color: "var(--muted-foreground)" },
	// Header cells, wherever the format puts them: one line in Markdown, CSV,
	// TSV, Jira, and Records; a repeated key inside every JSON object; a `<th>`
	// element in HTML.
	{ tag: tags.heading, ...headerCellStyle },
	{ tag: tags.propertyName, ...headerCellStyle },
	// Anything the user marked up inside a cell.
	{ tag: tags.strong, fontWeight: "600" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{
		tag: tags.link,
		color: "var(--selection-edge)",
		textDecoration: "underline",
	},
	// The address inside a link, and a bare autolink. The accent already says
	// this is a link; the underline belongs to the text that carries it.
	{ tag: tags.url, color: "var(--selection-edge)" },
	{ tag: tags.monospace, color: "var(--foreground)" },
	// Quoted CSV fields, JSON string values, and HTML attribute values: the case
	// where punctuation inside a value is data rather than structure.
	{ tag: tags.string, color: "var(--selection-edge)" },
	// A character standing in for one it cannot spell directly: a Markdown or
	// Jira backslash escape, an HTML entity, a Markdown task marker. The accent
	// marks it as notation rather than the literal text it looks like. It is
	// deliberately not `--status-warning`: that token means one thing, a source
	// that parsed with a non-blocking warning, and an escaped pipe is not one.
	{ tag: tags.escape, color: "var(--selection-edge)" },
	{ tag: tags.character, color: "var(--selection-edge)" },
	{ tag: tags.atom, color: "var(--selection-edge)" },
	{ tag: tags.tagName, color: "var(--selection-edge)" },
	// An attribute name is tag machinery, not content, so it recedes with the
	// brackets around it rather than competing with the element name.
	{ tag: tags.attributeName, color: "var(--muted-foreground)" },
	{ tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
	{ tag: tags.invalid, color: "var(--destructive)" },
	// Deliberately unstyled, and left at the pane's plain foreground:
	// - `number`, `bool`, and `null`, the typed JSON literals. A cell's type is
	//   carried, never read off its text (docs/adr/0008), and colouring the
	//   literals would invite reading a type out of the source. The accent on
	//   `string` already separates a quoted value from an unquoted one.
	// - `content`, `list`, `quote`, and `labelName`, which are the user's own
	//   text. Structure is emphasised here; content is left alone.
]);

export const syntaxTheme = [editorTheme, syntaxHighlighting(highlightStyle)];
