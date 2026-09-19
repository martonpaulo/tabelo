import type { Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	hoverTooltip,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { copy } from "@/copy/copy";
import { matchHtmlLineBreak } from "@/formats/html";
import { matchJiraEscape } from "@/formats/jira-inline";
import { matchMarkdownEscape } from "@/formats/markdown-inline";
import type { EscapeMatch, EscapeMatcher } from "@/formats/types";
import type { HighlightLanguage } from "@/views/types";
import { LINE_BREAK_GLYPH, SPACE_GLYPH, TAB_GLYPH } from "./indicator-glyphs";

// An escape sequence is notation: five characters of `&#32;` standing for one
// space the format cannot write directly. Read as text it is unreadable, and it
// takes the room of the sequence rather than of the value. This draws one glyph
// over each sequence, at exactly the width the serializer measured, so a
// Markdown column stays aligned around it. A line break is the exception: its
// `¶` takes one character, and the room the sequence gave back is added to the
// cell's padding instead (owner, 2026-09-19). See docs/design-system/2-tokens.md, "Syntax
// and table structure".
//
// It is a decoration and nothing else. The text, the caret offsets, the
// selection, the diagnostics, the clipboard, downloads, drafts, history, and
// persistence are byte-identical with the glyphs on and off. It is emphatically
// not a parser either: what an escape sequence is comes from the format that
// owns the grammar, in formats/markdown.ts and formats/jira.ts, so a sequence
// the editor draws over and a sequence the codec decodes are the same sequence.

// Which grammar a source view's escapes follow. The two pipe formats escape
// reversibly inside a cell. HTML has the entity rules the browser itself
// reads, so the only notation drawn there is its line break, `<br>`, which the
// owner asked to see as the same mark as every other format's (2026-09-19).
// CSV and TSV quote instead, and JSON and Records spell their values out.
export type EscapeSyntax = "markdown" | "jira" | "html";

export function escapeSyntax(language: HighlightLanguage): EscapeSyntax | null {
	switch (language) {
		case "markdown":
			return "markdown";
		case "jira":
			return "jira";
		case "html":
			return "html";
		default:
			return null;
	}
}

function matcherFor(syntax: EscapeSyntax): EscapeMatcher {
	switch (syntax) {
		case "markdown":
			return matchMarkdownEscape;
		case "jira":
			return matchJiraEscape;
		case "html":
			return matchHtmlLineBreak;
	}
}

// Whether a format pads its cells to a common width, which is what decides
// whether a line break's narrower glyph owes the room it gave back. Only
// Markdown aligns its columns; Jira and HTML write each cell at its own length.
function padsCells(syntax: EscapeSyntax): boolean {
	return syntax === "markdown";
}

// The cell delimiter of the two pipe formats. HTML has none on a line.
const CELL_DELIMITER = "|";

// Whether a sequence stands for a line break, whatever its spelling: `<br>`,
// Jira's double backslash, and an entity such as `&#10;` all decode to one.
export function encodesLineBreak(match: EscapeMatch): boolean {
	return match.decoded === "\n";
}

// How many characters of the editor's monospaced font a sequence's glyph
// takes. Every glyph keeps the room of the sequence it replaces, except the
// line break's, which takes one character.
export function glyphColumns(match: EscapeMatch): number {
	return encodesLineBreak(match) ? 1 : match.source.length;
}

export interface FoundEscape {
	// Offset of the sequence within the line it was found on.
	readonly offset: number;
	readonly match: EscapeMatch;
}

// Every escape sequence on one line, in one pass from its start. Passing over
// the whole line rather than over each cell is what keeps the scan aligned with
// the decoder: a sequence never spans a delimiter, and a character that begins
// no sequence advances by exactly one, which is the rule the codecs' own row
// splitters follow.
export function scanEscapes(
	line: string,
	syntax: EscapeSyntax,
): readonly FoundEscape[] {
	const matcher = matcherFor(syntax);
	const found: FoundEscape[] = [];
	for (let index = 0; index < line.length; index += 1) {
		const match = matcher(line, index);
		if (!match) continue;
		found.push({ offset: index, match });
		index += match.source.length - 1;
	}
	return found;
}

// Whitespace that is neither a plain space nor a tab: a non-breaking space, an
// em space, a line separator. A relative of the space dot rather than the dot
// itself, because claiming it is an ordinary space is the mistake this glyph
// exists to prevent. The tooltip names exactly which one it is.
const OTHER_SPACE_GLYPH = "◦";

// One glyph per sequence, chosen by what the sequence resolves to rather than
// by how it is spelled, so the same character reads the same way in both
// formats. Whitespace reuses the vocabulary the space and tab indicators
// already established, and everything else shows the character the notation
// stands for, which is the one case where the answer is simply visible.
export function escapeGlyph(match: EscapeMatch): string {
	if (encodesLineBreak(match)) return LINE_BREAK_GLYPH;
	switch (match.kind) {
		case "whitespace":
			if (match.decoded === " ") return SPACE_GLYPH;
			if (match.decoded === "\t") return TAB_GLYPH;
			return OTHER_SPACE_GLYPH;
		default:
			// A protected spelling such as `\<br>` restores several characters,
			// and drawing all of them would be the notation again. The first is
			// what the reader recognises the sequence by, and the tooltip carries
			// the rest.
			return match.decoded.slice(0, 1);
	}
}

// The glyph as a CSS string the theme's `content` can hold. A backslash is one
// of the characters an escape sequence stands for, and it is also how CSS
// escapes the quote around a string, so writing it raw would end the string
// early and draw the quote instead.
// https://developer.mozilla.org/en-US/docs/Web/CSS/string
function cssString(value: string): string {
	return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

// The room a line break's glyph gave back, drawn at the end of its cell as
// extra padding, so the delimiter after it stays in the column the serializer
// measured. Nothing in the file corresponds to it: it is a zero-length widget
// with no text and nothing to read out, placed just before the delimiter.
class CellPaddingWidget extends WidgetType {
	constructor(readonly columns: number) {
		super();
	}

	toDOM() {
		const padding = document.createElement("span");
		padding.className = "cm-tabeloEscapePadding";
		padding.setAttribute("aria-hidden", "true");
		padding.style.width = `${this.columns}ch`;
		return padding;
	}

	eq(other: CellPaddingWidget) {
		return other.columns === this.columns;
	}
}

// Where each cell of a pipe-format line ends: every delimiter that no escape
// sequence consumed. An escaped pipe is inside a sequence, so it never ends a
// cell, which is the same rule the codecs' own row splitters follow.
function delimiterOffsets(
	line: string,
	escapes: readonly FoundEscape[],
): number[] {
	const offsets: number[] = [];
	let next = 0;
	for (let index = 0; index < line.length; index += 1) {
		const sequence = escapes[next];
		if (sequence && index === sequence.offset) {
			index += sequence.match.source.length - 1;
			next += 1;
			continue;
		}
		if (line[index] === CELL_DELIMITER) offsets.push(index);
	}
	return offsets;
}

// The padding a padded format owes each cell, keyed by the line offset it is
// drawn at: the delimiter that ends the cell, or the end of the line when a
// draft leaves the cell open. Exported for the unit tests, which pin the
// arithmetic without a browser.
export function owedPadding(
	line: string,
	escapes: readonly FoundEscape[],
): Map<number, number> {
	const owed = new Map<number, number>();
	const breaks = escapes.filter(({ match }) => encodesLineBreak(match));
	if (breaks.length === 0) return owed;
	const delimiters = delimiterOffsets(line, escapes);
	for (const { offset, match } of breaks) {
		const end =
			delimiters.find((delimiter) => delimiter > offset) ?? line.length;
		const room = match.source.length - glyphColumns(match);
		owed.set(end, (owed.get(end) ?? 0) + room);
	}
	return owed;
}

// The drawn mark every notation glyph shares, in the room it is given: one
// owner for its element, so an escape sequence's glyph and the marker for a
// literal line break look and measure the same.
export function glyphMarker(glyph: string, columns: number): HTMLSpanElement {
	const marker = document.createElement("span");
	marker.className = "cm-tabeloEscape";
	marker.style.setProperty("--tabelo-escape-glyph", cssString(glyph));
	marker.style.width = `${columns}ch`;

	// The glyph itself is drawn for the eye only. It needs its own element so
	// hiding it from assistive technology does not also hide the source text
	// an escape widget keeps beside it.
	const drawn = document.createElement("span");
	drawn.className = "cm-tabeloEscapeGlyph";
	drawn.setAttribute("aria-hidden", "true");
	marker.appendChild(drawn);
	return marker;
}

class EscapeWidget extends WidgetType {
	constructor(
		// Exactly the characters of the file this widget is drawn instead of.
		readonly source: string,
		readonly glyph: string,
		// How wide the glyph is drawn, in characters of the editor's monospaced
		// font: the width of the sequence it replaces, so a padded column holds,
		// or one character for a line break, whose room goes to the cell's
		// padding instead.
		readonly columns: number,
	) {
		super();
	}

	toDOM() {
		const marker = glyphMarker(this.glyph, this.columns);

		// Replacing a run takes it out of the rendered DOM, and unlike the
		// padding the empty-value placeholder covers, these are characters the
		// file actually holds. So the sequence is put back as text nobody can
		// see: the accessible text of a source view stays its source text,
		// exactly and in order, and what a reader who cannot see the glyph hears
		// is what the file says. The tooltip explains it for everyone else.
		const spelling = document.createElement("span");
		spelling.className = "cm-tabeloEscapeSource";
		spelling.textContent = this.source;
		marker.appendChild(spelling);
		return marker;
	}

	// The glyph belongs here as well as the spelling: `\\` is an escaped
	// backslash in Markdown and a line break in Jira, so two widgets over the
	// same characters are the same drawing only when they mean the same thing.
	// Without it, switching a pane between the two formats reuses the DOM of the
	// widget it replaced and keeps the previous format's glyph.
	eq(other: EscapeWidget) {
		return (
			other.source === this.source &&
			other.glyph === this.glyph &&
			other.columns === this.columns
		);
	}

	// Without this a click on the glyph maps to no document position at all and
	// drops the caret at the start of the pane. The editor handles it instead,
	// and the atomic range below moves the caret to the nearer boundary of the
	// sequence, so the source stays editable from either side.
	ignoreEvent() {
		return false;
	}
}

function buildDecorations(
	view: EditorView,
	syntax: EscapeSyntax,
	lineBreaks: boolean,
): DecorationSet {
	const ranges: Range<Decoration>[] = [];

	for (const { from, to } of view.visibleRanges) {
		const firstLine = view.state.doc.lineAt(from).number;
		const lastLine = view.state.doc.lineAt(to).number;
		for (let number = firstLine; number <= lastLine; number += 1) {
			const line = view.state.doc.line(number);
			// With the line-break mark switched off, a break's sequence shows as
			// written; every other glyph is always drawn.
			const escapes = scanEscapes(line.text, syntax).filter(
				({ match }) => lineBreaks || !encodesLineBreak(match),
			);
			for (const { offset, match } of escapes) {
				const at = line.from + offset;
				ranges.push(
					Decoration.replace({
						widget: new EscapeWidget(
							match.source,
							escapeGlyph(match),
							glyphColumns(match),
						),
					}).range(at, at + match.source.length),
				);
			}
			if (!padsCells(syntax)) continue;
			for (const [offset, columns] of owedPadding(line.text, escapes)) {
				// On the delimiter's near side, so a caret placed just before the
				// delimiter is drawn against it rather than where the padding
				// starts.
				ranges.push(
					Decoration.widget({
						widget: new CellPaddingWidget(columns),
						side: -1,
					}).range(line.from + offset),
				);
			}
		}
	}

	return Decoration.set(ranges, true);
}

// The sequence covering a document position, or nothing where the position sits
// on ordinary text.
export function escapeAt(
	line: string,
	column: number,
	syntax: EscapeSyntax,
): FoundEscape | null {
	for (const found of scanEscapes(line, syntax)) {
		if (column < found.offset) break;
		if (column < found.offset + found.match.source.length) return found;
	}
	return null;
}

export function escapeSequenceGlyphs(
	syntax: EscapeSyntax,
	lineBreaks: boolean,
) {
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, syntax, lineBreaks);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = buildDecorations(update.view, syntax, lineBreaks);
				}
			}
		},
		{ decorations: (instance) => instance.decorations },
	);

	// A glyph has no matching visual character to put a caret inside, so the
	// whole sequence moves as one piece: arrow keys step over it, a selection
	// takes all of it, and a click lands on the nearer side.
	const atomic = EditorView.atomicRanges.of(
		(view) => view.plugin(plugin)?.decorations ?? Decoration.none,
	);

	// What the glyph stands for, said rather than shown, because the character
	// it resolves to is exactly the one that cannot be drawn here.
	const tooltip = hoverTooltip((view, position) => {
		const line = view.state.doc.lineAt(position);
		const found = escapeAt(line.text, position - line.from, syntax);
		if (!found) return null;
		const at = line.from + found.offset;
		return {
			pos: at,
			end: at + found.match.source.length,
			above: true,
			// Every tooltip in the product points at what it explains.
			arrow: true,
			create: () => {
				const dom = document.createElement("div");
				dom.className = "cm-diagnosticTooltip";
				dom.textContent = copy.source.escapeSequence(found.match);
				return { dom };
			},
		};
	});

	return [plugin, atomic, tooltip];
}
