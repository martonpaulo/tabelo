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
import { matchJiraEscape } from "@/formats/jira";
import { matchMarkdownEscape } from "@/formats/markdown";
import type { EscapeMatch, EscapeMatcher } from "@/formats/types";
import type { HighlightLanguage } from "@/views/types";
import { SPACE_GLYPH, TAB_GLYPH } from "./whitespace-indicators";

// An escape sequence is notation: five characters of `&#32;` standing for one
// space the format cannot write directly. Read as text it is unreadable, and it
// takes the room of the sequence rather than of the value. This draws one glyph
// over each sequence, at exactly the width the serializer measured, so a
// Markdown column stays aligned around it. See docs/design-system.md, "Syntax
// and table structure".
//
// It is a decoration and nothing else. The text, the caret offsets, the
// selection, the diagnostics, the clipboard, downloads, drafts, history, and
// persistence are byte-identical with the glyphs on and off. It is emphatically
// not a parser either: what an escape sequence is comes from the format that
// owns the grammar, in formats/markdown.ts and formats/jira.ts, so a sequence
// the editor draws over and a sequence the codec decodes are the same sequence.

// Which grammar a source view's escapes follow. Only the two pipe formats
// escape reversibly inside a cell: CSV and TSV quote instead, HTML has the
// entity rules the browser itself reads, and JSON and Records spell their
// values out.
export type EscapeSyntax = "markdown" | "jira";

export function escapeSyntax(language: HighlightLanguage): EscapeSyntax | null {
	switch (language) {
		case "markdown":
			return "markdown";
		case "jira":
			return "jira";
		default:
			return null;
	}
}

function matcherFor(syntax: EscapeSyntax): EscapeMatcher {
	return syntax === "markdown" ? matchMarkdownEscape : matchJiraEscape;
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

// A line break, wherever a source view has to show one inside a line.
const LINE_BREAK_GLYPH = "↵";
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
	switch (match.kind) {
		case "line-break":
			return LINE_BREAK_GLYPH;
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

class EscapeWidget extends WidgetType {
	constructor(
		// Exactly the characters of the file this widget is drawn instead of.
		readonly source: string,
		readonly glyph: string,
		// How wide the sequence it replaces is, in characters of the editor's
		// monospaced font. Markdown padded its column counting those characters,
		// so drawing narrower would shift every delimiter after it on the line.
		readonly columns: number,
	) {
		super();
	}

	toDOM() {
		const marker = document.createElement("span");
		marker.className = "cm-tabeloEscape";
		marker.style.setProperty("--tabelo-escape-glyph", cssString(this.glyph));
		marker.style.width = `${this.columns}ch`;

		// The glyph itself is drawn for the eye only: it is generated content in
		// the editor theme rather than a text node, so it cannot be read out or
		// picked up by a copy that falls back to the DOM.
		marker.setAttribute("aria-hidden", "true");

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
): DecorationSet {
	const ranges: Range<Decoration>[] = [];

	for (const { from, to } of view.visibleRanges) {
		const firstLine = view.state.doc.lineAt(from).number;
		const lastLine = view.state.doc.lineAt(to).number;
		for (let number = firstLine; number <= lastLine; number += 1) {
			const line = view.state.doc.line(number);
			for (const { offset, match } of scanEscapes(line.text, syntax)) {
				const at = line.from + offset;
				ranges.push(
					Decoration.replace({
						widget: new EscapeWidget(
							match.source,
							escapeGlyph(match),
							match.source.length,
						),
					}).range(at, at + match.source.length),
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

export function escapeSequenceGlyphs(syntax: EscapeSyntax) {
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, syntax);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = buildDecorations(update.view, syntax);
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
