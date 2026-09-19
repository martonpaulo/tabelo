import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { copy } from "@/copy/copy";
import { SPACE_GLYPH, TAB_GLYPH } from "./indicator-glyphs";
import {
	ALL_SPACES_CLASS,
	SPACE_SCOPE_CLASS,
	TAB_INDICATOR_CLASS,
} from "./whitespace-indicators";

// The editor is styled entirely from Tabelo's tokens so it stays part of the
// product rather than looking like an embedded IDE. Semantic colour is shared
// with the grid, while structure stays quiet and content remains primary.
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

// One tone for the non-content annotations the editor draws as glyphs: the tab
// arrow and the empty-field placeholder. The space dot mixes the same muted
// tone at a higher strength, below. The muted tone that
// structure already uses, at half strength, because an annotation answers a
// question the reader has to ask before it matters and must not compete with
// the text it describes. Mixed rather than applied as an opacity, so nesting
// two of these marks over the same characters cannot fade one of them twice.
const annotationStyle = {
	color: "color-mix(in oklab, var(--muted-foreground) 40%, transparent)",
};

// The space dot, painted rather than laid out. A background fills the box the
// character already has, so it costs no containing block, no pseudo-element
// box, and no text shaping: the three things a marked space paid for on every
// scroll repaint when Markdown's alignment padding put a thousand of them in
// one viewport (#275). It is the mechanism CodeMirror's own
// `highlightWhitespace()` uses, in Tabelo's tone rather than CodeMirror's. A background is not content
// at all, which strengthens rather than weakens what the pseudo-element
// promised: it can add no advance width, and it can never be read out, copied,
// downloaded, or extracted from the DOM. `background-position` centres it in
// the character at every `--pane-zoom`, because both the box and the gradient
// scale with the font size.
//
// `closest-side` is what keeps the dot the weight the `·` glyph had. CodeMirror
// sizes its own dot against the default `farthest-corner`, which measures the
// box's diagonal, so the marker would grow with the line height rather than
// with the character: at Tabelo's two-rem line box that draws a dot roughly
// twice the glyph's diameter. Measured from the closest side instead, the
// radius is half the character's width and nothing else, and the two stops
// give the edge a feather rather than leaving it aliased.
//
// The dot is the one annotation drawn stronger than the shared tone (owner,
// 2026-09-19): at the tone and size the other markers use, a dot a few pixels
// across all but vanished on a real screen. It stays in the muted family,
// mixed to a higher strength, and its radius grows from 22% to 30% of the
// character's half-width, so a run of spaces is countable at a glance and
// still reads as a mark below the text rather than as a character.
const spaceDotColor =
	"color-mix(in oklab, var(--muted-foreground) 70%, transparent)";
const spaceDot = {
	backgroundImage: `radial-gradient(circle closest-side at 50% 55%, ${spaceDotColor} 30%, transparent 42%)`,
	backgroundPosition: "center",
	backgroundRepeat: "no-repeat",
};

// The character the forced-colours fallback in index.css draws, published to
// CSS rather than repeated there, so `whitespace-indicators.ts` stays the one
// owner of the glyph. This is the same handover `--tabelo-escape-glyph` already
// uses for the escape-sequence marker.
const spaceGlyphProperty = { "--tabelo-space-glyph": `"${SPACE_GLYPH}"` };

// The box of a widget drawn inside a source line: the empty-field placeholder
// and an escape sequence's glyph. Inline-block so the width the widget carries
// applies at all, which is what holds a Markdown column together around it.
//
// An inline-block's box is its line-height, which here is the whole 2rem line,
// while a text run's box is only its font's content area. CodeMirror measures a
// caret beside a widget from the widget's own box, so a line-tall box drew that
// caret from the top of the line instead of on the text. The placeholder was
// sized like text for that reason, and the escape glyph was not, so a caret
// beside a `&#160;` still sat a quarter line high. Every such widget takes
// this one box, so every caret in the line stays on the text.
const inlineWidgetBox = {
	display: "inline-block",
	lineHeight: "normal",
};

export const editorTheme = EditorView.theme({
	// The pane body draws the inset code box (panel.tsx); the editor fills it.
	"&": {
		height: "100%",
		fontSize: contentFontSize,
		backgroundColor: "var(--surface-code)",
		color: "var(--foreground)",
	},
	".cm-tabeloColumnMarker[data-selected]": {
		cursor: "grab",
		fontWeight: "600",
	},
	".cm-scroller": {
		// The column markers (#368) float over the top of the scroller, which
		// runs the pane's full height, so the text starts below them: they
		// publish their height as `--tabelo-source-top-inset` while shown. With
		// the strip the text starts right under it, as the grid's header row
		// starts right under its letters, so every row sits at the same height
		// in every view (owner, 2026-09-19); without one, a small inset.
		paddingTop: "var(--tabelo-source-top-inset, calc(var(--spacing) * 1.5))",
		fontFamily: "var(--font-family-source)",
		lineHeight: contentLineBox,
		overscrollBehavior: "contain",
	},
	".cm-content": {
		// No top padding: the first line is the table's header row, so a gap above
		// it would separate table data from its pane. The bottom padding is the
		// room every pane leaves below its content (`--pane-end-room`), which is
		// also the target for clicking below the last line to focus the editor.
		padding: "0 0 var(--pane-end-room)",
		outline: "none",
		userSelect: "text",
	},
	// Trailing only, and horizontal only. A source line's vertical rhythm has to
	// come from the line height above, never from padding here: the app's base
	// reset zeroes padding on this element with a precedence a theme rule does
	// not beat, so a vertical value written here is silently dropped and the
	// numbers beside it end up measuring a different row than the text does.
	// There is deliberately no leading value. The selection layer measures
	// from the line's content box, so a left padding here leaves a band between
	// the gutter and the highlight that nothing paints, while `.cm-activeLine`
	// below fills the whole line box and does reach the gutter: the two would
	// disagree on one element. The leading space lives on the gutter's trailing
	// edge instead, so character zero starts where the selection does. Moving it
	// back here, or onto `.cm-content`, reopens the gap, because both leave
	// character zero the same distance from the gutter.
	// The trailing value is the room every pane leaves after its widest line.
	".cm-line": { padding: "0 var(--pane-trailing-room) 0 0" },
	// The numbers share the code box's surface, with no band or dividing line
	// of their own; their tone and the active line's lift tell them apart.
	// Set exactly as the grid's row numbers are, face, size, tone and figures,
	// so a row's number reads the same in every view (owner, 2026-09-19).
	".cm-gutters": {
		backgroundColor: "var(--surface-code)",
		color: "var(--muted-foreground)",
		fontFamily: "var(--font-family-index)",
		fontSize: "var(--text-xs)",
		fontVariantNumeric: "tabular-nums",
		// The same row box the content uses, so a number's natural height
		// already equals the line block beside it. The numbers are then level
		// from the first paint, rather than drifting until CodeMirror's own
		// measurement pass replaces their heights, which is not guaranteed to
		// have run before the editor is first shown.
		lineHeight: contentLineBox,
		border: "none",
		userSelect: "none",
	},
	".cm-lineNumbers .cm-gutterElement": {
		// One gap on each side of the digits, and no minimum width: CodeMirror
		// sizes the gutter to its widest number, so it fits one, two, or three
		// digits at any zoom without reserving room for digits that are not
		// there (#367). The trailing gap is also the source text's leading space,
		// because the line itself cannot hold it without unpainting the
		// selection there. See the note on `.cm-line` above.
		// A wider inset on the outside than toward the text, and the digits
		// set flush right, so the numbers read as a column of their own inside
		// the code box rather than as part of the first character (owner,
		// 2026-09-19).
		// The trailing gap is the index gap every view keeps between a row's
		// number and its text, which the grid's row numbers keep too.
		padding: "0 var(--index-text-gap) 0 calc(var(--spacing) * 5)",
		textAlign: "right",
	},
	// The current line is marked only in the editor that has focus (owner,
	// 2026-09-19). Every pane keeps its own caret line while another pane is
	// being worked in, and four tinted lines at once said nothing about where
	// the typing would go.
	".cm-activeLine": { backgroundColor: "transparent" },
	"&.cm-focused .cm-activeLine": {
		backgroundColor: "var(--active-line-fill)",
	},
	// The pinned header (#252), a read-only copy of the header row floating over
	// the top of the text while the real one is scrolled away. It paints the
	// pane surface, opaque, because live rows pass underneath it, and its edge is
	// the strong line the grid's pinned layers already draw: the boundary, not a
	// tint, is what says it stands in front. It never takes more than half the
	// pane, so a tall wrapped or multi-line header still leaves room to edit, and
	// it takes no pointer: a press over it is sent to the real header.
	// Hidden unless the editor is scrolled past the header, which the
	// scroll-driven reveal decides in the same frame as the scroll
	// (pinned-header.ts).
	".cm-tabeloPinnedHeader": {
		position: "absolute",
		top: "0",
		left: "0",
		zIndex: "1",
		maxHeight: "50%",
		overflow: "hidden",
		backgroundColor: "var(--surface-code)",
		borderBottom: "var(--hairline-w) solid var(--line-strong)",
		pointerEvents: "none",
		userSelect: "none",
		opacity: "0",
		animation: "tabelo-pin-reveal linear both",
		animationTimeline: "--tabelo-source-y",
		animationRange:
			"var(--tabelo-pin-at, 0px) calc(var(--tabelo-pin-at, 0px) + var(--hairline-w))",
	},
	// The column markers (#368), an overlay across the top of the scroller.
	// They wear the grid's column index strip exactly: its fixed height, which
	// keeps its size at every zoom like the grid's, the code surface with no
	// band and no line under it, and the index face in the muted tone. Opaque,
	// because the text scrolls underneath, and above the pinned header, which
	// stands directly below. No pointer, so a wheel over it still scrolls.
	".cm-tabeloColumnStrip": {
		position: "absolute",
		left: "0",
		zIndex: "2",
		height: "var(--grid-strip-h)",
		overflow: "hidden",
		backgroundColor: "var(--surface-code)",
		pointerEvents: "none",
		userSelect: "none",
	},
	// Everything right of the line numbers; the corner above them is dead, as
	// the grid's is where its letters meet its row numbers.
	".cm-tabeloColumnTrack": {
		position: "absolute",
		top: "0",
		right: "0",
		bottom: "0",
		overflow: "hidden",
	},
	".cm-tabeloColumnMarker": {
		position: "absolute",
		top: "0",
		lineHeight: "var(--grid-strip-h)",
		fontFamily: "var(--font-family-index)",
		fontSize: "var(--text-xs)",
		color: "var(--muted-foreground)",
		whiteSpace: "nowrap",
		pointerEvents: "auto",
		cursor: "pointer",
	},
	".cm-tabeloColumnMarker::before": { content: "attr(data-letter)" },
	// A letter is its column's label to a pointer (#395), over the whole span
	// of its header cell, and reads like the grid's: the pointer cursor at
	// rest, the foreground tone under the pointer and while its column is
	// selected, and the grab cursor then, because a press picks it up.
	".cm-tabeloColumnMarker:hover, .cm-tabeloColumnMarker[data-selected]": {
		color: "var(--foreground)",
	},
	// A selected column's letter and the current line's number are set as the
	// grid sets a selected row's number and column's letter: semibold, in the
	// foreground tone (owner, 2026-09-19).
	".cm-activeLineGutter": { backgroundColor: "transparent" },
	"&.cm-focused .cm-activeLineGutter": {
		backgroundColor: "var(--active-line-fill)",
		color: "var(--foreground)",
		fontWeight: "600",
	},
	// `drawSelection`'s own layers are replaced by the ones in drawn-selection.ts,
	// which fix their geometry; its selection and cursor layers stay mounted and
	// are simply not shown.
	".cm-selectionLayer, .cm-cursorLayer": { display: "none" },
	".cm-tabeloCaretLayer": { pointerEvents: "none" },
	// Two hairlines wide: the owner found the one-hairline caret too thin to
	// find at a glance (2026-09-18). Its position is snapped to device pixels
	// where it is measured, so it is equally sharp at every column (#359).
	".cm-tabeloCaret, .cm-dropCursor": {
		display: "none",
		borderLeft: "calc(2 * var(--hairline-w)) solid var(--selection-edge)",
		height: "calc(var(--pane-zoom, 1) * 1.25rem) !important",
		marginTop: "calc(var(--pane-zoom, 1) * -0.125rem)",
	},
	"&.cm-focused .cm-tabeloCaret, .cm-dropCursor": { display: "block" },
	"&.cm-focused > .cm-scroller > .cm-tabeloCaretLayer": {
		animation: "steps(1) cm-blink 1.2s infinite",
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
	// Find in a source pane (#280) marks what the grid's bar marks: the current
	// occurrence alone, in the solid accent with its paired foreground, and no
	// second highlight on the others (docs/design-system/9-accessibility.md). Upstream paints
	// every match, so its plain match class is cleared and only the selected one
	// is drawn. `!important` for the reason given above: the base theme's
	// scheme-specific selector is more specific than this one.
	".cm-searchMatch": { backgroundColor: "transparent !important" },
	".cm-searchMatch.cm-searchMatch-selected, .cm-searchMatch-selected *": {
		backgroundColor: "var(--primary) !important",
		color: "var(--primary-foreground) !important",
	},
	// Upstream's panel is only the switch that turns its highlighting on; the
	// pane draws its own bar. See source-find.ts.
	".cm-panels:has(> .cm-tabeloFindHost:only-child)": { display: "none" },
	// HTML is the one format whose header cells no grammar marks for us, so the
	// project-owned decorator in html-language.ts supplies them. It wears the
	// same treatment the `heading` tag carries everywhere else, from the same
	// definition, so there is one owner for what a header cell looks like.
	".cm-tableHeaderCell": headerCellStyle,
	// Non-content annotation: whitespace and empty-value indicators. They are
	// decorations over text the user typed, never text themselves, and they
	// answer a question the reader has to ask before they matter, so they sit
	// below the content rather than beside it: the muted tone at half strength,
	// findable when looked for and ignorable when not. Each one is a distinct
	// glyph, so none depends on colour alone to be told apart from content.
	// CodeMirror draws its own dot and arrow as background images in its own
	// grey; both are cleared here, because the tone and the shapes below are the
	// ones this product chose. Clearing them is also what leaves an unmarked
	// space unmarked: the mode rules further down are the only thing that puts
	// anything back, and each is more specific than this one.
	".cm-highlightSpace, .cm-highlightTab": {
		backgroundImage: "none",
	},
	".cm-highlightTab": {
		// The anchor for the arrow below. Painting it in an absolutely
		// positioned pseudo-element is what keeps it free of advance width, so
		// the annotated character stays exactly one character wide and the text
		// beside it never moves. A tab is one span per tab and only ever appears
		// in quantity in TSV, so the cost of a laid-out box is paid rarely; a
		// space is one span per character in Markdown's alignment padding, which
		// is why it is painted instead. See #275.
		position: "relative",
	},
	".cm-highlightTab::before": {
		...annotationStyle,
		position: "absolute",
		left: "0",
		right: "0",
		textAlign: "center",
		// Drawn over the character, never in place of it: no pointer, no
		// selection, no width. The tab underneath stays the selectable, copyable
		// thing it always was.
		pointerEvents: "none",
		userSelect: "none",
	},
	// Which spans actually carry a glyph is the reader's choice, arriving as a
	// class on the editor for the two whole-document answers and as a scope mark
	// around the qualifying spaces for the rest. The spans themselves always
	// exist while anything is marked, so switching a mode repaints and nothing
	// more.
	// `&` is the editor root, which is what carries these two: a rule written
	// as a plain descendant would be scoped under the root and could never
	// match the root itself.
	[`&.${TAB_INDICATOR_CLASS} .cm-highlightTab::before`]: {
		content: `"${TAB_GLYPH}"`,
	},
	[`&.${ALL_SPACES_CLASS} .cm-highlightSpace`]: spaceDot,
	// The two narrower modes: CodeMirror's own trailing-whitespace mark, and the
	// one scope this project marks itself, because no built-in describes it.
	".cm-trailingSpace .cm-highlightSpace": spaceDot,
	[`.${SPACE_SCOPE_CLASS} .cm-highlightSpace`]: spaceDot,
	// The same three answers again, publishing the glyph the forced-colours
	// fallback draws. Forced colours paints no background image, so the dot
	// alone would leave the space the one annotation with nothing left, while
	// the tab arrow and the placeholder survive as generated content. The rule
	// that draws it lives in index.css, because a CodeMirror theme cannot carry
	// `&` inside a media query; what it may not carry is the character, so the
	// character is handed over as a property set on the element that decides a
	// space is marked. One element per mode rather than one per space, so the
	// fallback costs nothing on the path this change exists to make cheap.
	[`&.${ALL_SPACES_CLASS}`]: spaceGlyphProperty,
	[`.${SPACE_SCOPE_CLASS}`]: spaceGlyphProperty,
	".cm-trailingSpace": {
		...spaceGlyphProperty,
		// CodeMirror's base theme tints this red, which here would spend a status
		// colour on a token and claim an error the parser never reported. The
		// dots are the whole cue.
		backgroundColor: "transparent",
	},
	// The empty-field placeholder, the one marker this product draws itself. It
	// is drawn instead of the padding Markdown already reserved for it, so the
	// column stays aligned around it, and it edits nothing: the caret, the
	// selection, and the diagnostic underlines are all still measured in the
	// characters the user typed.
	".cm-tabeloEmptyValue::before": {
		// Generated content, so the placeholder is never a text node the DOM, a
		// screen reader, or a copy could pick up. The word itself has one owner
		// in the copy module, like every other visible string.
		content: `"${copy.source.emptyValue}"`,
	},
	".cm-tabeloEmptyValue": {
		...annotationStyle,
		// Inline-block so the minimum width the widget carries applies at all:
		// that width is the padding Markdown already reserved for it, which is
		// what holds the column together. Its text is left to the line's own
		// alignment rather than centred inside that width, because Markdown
		// writes every cell against the left of its column and pads to the right
		// of it whatever the column declares.
		...inlineWidgetBox,
		userSelect: "none",
	},
	// An escape sequence, drawn as the one character it stands for. It wears the
	// notation treatment the syntax tokens already use for an escape, because it
	// is the same thing said more briefly: notation, not the character it
	// resembles. The distinct glyph is the channel that survives forced colours,
	// where the tone does not.
	".cm-tabeloEscapeGlyph::before": {
		// Generated content and a custom property keep the glyph out of DOM text;
		// its element is aria-hidden so assistive technology also ignores it,
		// while each sequence still gets its own character.
		content: "var(--tabelo-escape-glyph)",
	},
	".cm-tabeloEscape": {
		color: "var(--syntax-notation)",
		// The width the widget carries: the sequence's own for every glyph but
		// the line break's, which takes one character and hands the rest to the
		// cell's padding below. Inline-block is what makes that width apply at
		// all, and centring puts the one glyph in the middle of its room.
		...inlineWidgetBox,
		textAlign: "center",
		// No `overflow` here: anything but `visible` moves an inline-block's
		// baseline to its bottom margin edge, which lifts the glyph off the line
		// the rest of the row sits on. There is nothing to clip either, since one
		// character is always narrower than the sequence it replaces.
		position: "relative",
		userSelect: "none",
	},
	// The room a line break's one-character glyph gave back, drawn at the end
	// of its Markdown cell so the next delimiter keeps its column. Empty and
	// sized by the width the widget carries.
	".cm-tabeloEscapePadding": {
		...inlineWidgetBox,
		userSelect: "none",
	},
	// The room column alignment draws after a CSV, TSV, or Jira field so the
	// next column starts where it does on every other row (#396). Empty and
	// sized by the width the widget carries, like the padding above.
	".cm-tabeloAlignPadding": {
		...inlineWidgetBox,
		userSelect: "none",
	},
	// The sequence itself, kept in the accessible tree and out of sight. Clipped
	// rather than hidden, because `display: none` and `visibility: hidden` both
	// take it out of the accessible tree as well, which is the one thing it is
	// here for.
	".cm-tabeloEscapeSource": {
		position: "absolute",
		width: "var(--hairline-w)",
		height: "var(--hairline-w)",
		overflow: "hidden",
		clipPath: "inset(50%)",
		whiteSpace: "nowrap",
	},
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
		border: "var(--hairline-w) solid var(--line-floating)",
		borderRadius: "var(--control-radius)",
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
		boxShadow: "var(--shadow-floating)",
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
	// give the source its shape. In the punctuation tone, the quietest in the
	// palette, so the data reads first. `punctuation`
	// is the parent of every bracket tag, so JSON's braces and square brackets
	// and HTML's angle brackets are all covered by that one entry.
	{ tag: tags.punctuation, color: "var(--syntax-punctuation)" },
	{ tag: tags.separator, color: "var(--syntax-punctuation)" },
	// Markdown's own markers: the pipes of a table row, the alignment divider
	// under the header, and the `#`, `*`, `>`, and `-` that open a construct.
	// The divider is structure like any other delimiter and recedes with them.
	{ tag: tags.processingInstruction, color: "var(--syntax-punctuation)" },
	{ tag: tags.contentSeparator, color: "var(--syntax-punctuation)" },
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
		color: "var(--syntax-link)",
		textDecoration: "underline",
	},
	// The address inside a link, and a bare autolink. The link tone already says
	// this is a link; the underline belongs to the text that carries it.
	{ tag: tags.url, color: "var(--syntax-link)" },
	{ tag: tags.monospace, color: "var(--foreground)" },
	// Quoted CSV fields, JSON string values, and HTML attribute values: the case
	// where punctuation inside a value is data rather than structure.
	{ tag: tags.string, color: "var(--value-string)" },
	{
		tag: tags.number,
		color: "var(--value-number)",
		fontWeight: "600",
		fontVariantNumeric: "tabular-nums",
	},
	{
		tag: tags.bool,
		color: "var(--value-boolean)",
		fontWeight: "600",
	},
	{ tag: tags.null, color: "var(--value-null)" },
	// A character standing in for one it cannot spell directly: a Markdown or
	// Jira backslash escape, an HTML entity, or a Markdown task marker. Its token
	// shape and grammar position keep notation distinct from close value hues
	// and in forced-colour mode. This treatment is deliberately not
	// `--status-warning`: that token means one thing, a source that parsed with
	// a non-blocking warning, and an escaped pipe is not one.
	{
		tag: [tags.escape, tags.character, tags.atom],
		color: "var(--syntax-notation)",
	},
	// An HTML element name is structure an HTML pane is almost made of, so it
	// takes a calm hue of its own and leaves the notation colour to the escapes
	// that stand out against it (owner, 2026-09-19).
	{ tag: tags.tagName, color: "var(--syntax-tag)" },
	// An attribute name is tag machinery, not content, so it recedes with the
	// brackets around it rather than competing with the element name.
	{ tag: tags.attributeName, color: "var(--muted-foreground)" },
	{ tag: tags.comment, color: "var(--muted-foreground)" },
	{ tag: tags.invalid, color: "var(--destructive)" },
	// Deliberately unstyled, and left at the pane's plain foreground:
	// `content`, `list`, `quote`, and `labelName`, which are the user's own
	//   text. Structure is emphasised here; content is left alone.
]);

export const syntaxTheme = [editorTheme, syntaxHighlighting(highlightStyle)];
