import type { TextContent } from "@/core/types";
import {
	classOf,
	codePointAt,
	codePointBefore,
	type DelimitedMark,
	decodableEntity,
	entityKind,
	inlineFromTokens,
	literalsAhead,
	neighbourChar,
	neighbourClass,
	normalizeBreaks,
	numericEntity,
	type OutToken,
	type ParseToken,
	type TextGrammar,
	tokensText,
	writeInline,
} from "./inline-syntax";
import type { EscapeMatcher } from "./types";

// One Markdown table cell's content: the escape grammar of docs/adr/0002 and
// the inline syntax of docs/adr/0011, which is a deliberate subset of GFM:
//
//   **bold**  _italic_  <u>underline</u>  ~~strikethrough~~  `code`
//   [label](url)  ![alternative text](url)
//
// Nothing else is syntax. A single `*` or `~` is always literal, `_` between
// two letters or digits is literal as it is in GFM, and a marker that does not
// complete its construct stays exactly the text it was.

// The three ways a line break can be spelled in a Markdown cell, longest first
// so a match is never a prefix of a longer one. Both directions of the grammar
// read this list, so a spelling can never be escaped without being decodable.
const BREAK_SPELLINGS = ["<br />", "<br/>", "<br>"] as const;

function breakSpellingAt(value: string, index: number): string | null {
	for (const spelling of BREAK_SPELLINGS) {
		if (value.startsWith(spelling, index)) return spelling;
	}
	return null;
}

// The punctuation a backslash makes literal. The first two were always escapes;
// the rest are the characters the inline syntax gives meaning to.
const BACKSLASH_ESCAPABLE = new Set([
	"\\",
	"|",
	"*",
	"_",
	"~",
	"`",
	"[",
	"]",
	"(",
	")",
	"!",
	"<",
]);

// Sticky, so the entity match is anchored at `lastIndex` instead of searching
// forward, with none of the copying that matching `^` against a fresh slice of
// the remaining cell required.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/sticky
const ENTITY = /&#([0-9]+);/y;

// The one reader of Markdown's escape grammar, at one offset. Only `&`, `\`,
// and `<` can begin an escape sequence, so the switch reaches the right branch
// directly and an ordinary character falls straight through with no test at
// all. A branch that matches nothing must reach the same `null`: `break` leaves
// the switch, where returning early would swallow a trailing backslash or a
// lone `<`.
//
// The decoders below and the source view's escape glyphs both read this, so
// there is exactly one description of what `&#32;` stands for and the editor
// never becomes a second parser. What a match reports is never examined again,
// which is what keeps literal text such as `&amp;#32;` literal once its
// protected ampersand is restored.
export const matchMarkdownEscape: EscapeMatcher = (value, index) => {
	switch (value[index]) {
		// Decode only the entity forms the serializer emits: whitespace, and a
		// letter or digit written beside an italic delimiter it must not touch.
		case "&": {
			if (value.startsWith("&amp;", index)) {
				return { source: "&amp;", decoded: "&", kind: "character" };
			}
			// Set on every attempt rather than trusting what the previous call
			// left behind: the regex is shared module state, and a stale
			// `lastIndex` after a failed match is the classic defect with this
			// flag.
			ENTITY.lastIndex = index;
			const entity = ENTITY.exec(value);
			const decimal = entity?.[1];
			if (entity && decimal !== undefined) {
				const codePoint = Number(decimal);
				const decodable =
					String(codePoint) === decimal ? decodableEntity(codePoint) : null;
				if (decodable) {
					return {
						source: entity[0],
						decoded: decodable.decoded,
						kind: entityKind(decodable),
					};
				}
			}
			break;
		}
		// Longest escape first, and every escaped break form before the plain
		// backslash rule, or `\<br>` would decode as a backslash followed by a
		// line break.
		case "\\": {
			const spelling = breakSpellingAt(value, index + 1);
			if (spelling) {
				return {
					source: `\\${spelling}`,
					decoded: spelling,
					kind: "character",
				};
			}
			const next = value[index + 1];
			if (next !== undefined && BACKSLASH_ESCAPABLE.has(next)) {
				return { source: `\\${next}`, decoded: next, kind: "character" };
			}
			break;
		}
		case "<": {
			const spelling = breakSpellingAt(value, index);
			if (spelling) {
				return { source: spelling, decoded: "\n", kind: "line-break" };
			}
			break;
		}
	}
	return null;
};

export function unescapeCell(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === undefined) break;
		const match = matchMarkdownEscape(value, index);
		if (match) {
			out += match.decoded;
			index += match.source.length - 1;
			continue;
		}
		out += char;
	}
	return out;
}

// Parsing

function isSpace(char: string | null): boolean {
	return classOf(char) === "space";
}

function isAlnum(char: string | null): boolean {
	return classOf(char) === "alnum";
}

// `**` and `~~` open before non-whitespace and close after it. `_` also refuses
// a letter or digit on its outer side, which is what keeps `snake_case` text.
function delimiterToken(
	raw: string,
	index: number,
	from: number,
	to: number,
	mark: DelimitedMark,
	spelling: string,
): ParseToken {
	const before = codePointBefore(raw, index, from);
	const after = codePointAt(raw, index + spelling.length, to);
	const outerAllowed = mark !== "italic";
	return {
		kind: "delimiter",
		mark,
		raw: spelling,
		canOpen:
			after !== null && !isSpace(after) && (outerAllowed || !isAlnum(before)),
		canClose:
			before !== null && !isSpace(before) && (outerAllowed || !isAlnum(after)),
	};
}

function backtickRun(raw: string, index: number, to: number): number {
	let end = index;
	while (end < to && raw[end] === "`") end += 1;
	return end - index;
}

// A code span: a run of backticks, its content, and the next run of exactly as
// many. Escapes are read inside, so a pipe and a backtick can be written there;
// nothing else is syntax. The model holds no empty code and no line break in
// code, so either leaves the backticks literal.
function scanCode(
	raw: string,
	index: number,
	to: number,
): { readonly text: string; readonly end: number } | null {
	const fence = backtickRun(raw, index, to);
	let text = "";
	let at = index + fence;
	while (at < to) {
		const match = matchMarkdownEscape(raw, at);
		if (match && at + match.source.length <= to) {
			text += match.decoded;
			at += match.source.length;
			continue;
		}
		if (raw[at] === "`") {
			const run = backtickRun(raw, at, to);
			if (run === fence) {
				if (text === "" || /[\r\n]/.test(text)) return null;
				return { text, end: at + run };
			}
			text += raw.slice(at, at + run);
			at += run;
			continue;
		}
		text += raw[at];
		at += 1;
	}
	return null;
}

function decodeRange(raw: string, from: number, to: number): string {
	return unescapeCell(raw.slice(from, to));
}

// `[label](url)` or `![alt](url)`, starting at the bracket. The label may nest
// balanced brackets and hide one inside a code span; the destination may nest
// balanced parentheses and holds no raw whitespace, as in GFM.
function scanLink(
	raw: string,
	index: number,
	to: number,
	image: boolean,
): { readonly token: ParseToken; readonly end: number } | null {
	const labelFrom = index + (image ? 2 : 1);
	let depth = 0;
	let at = labelFrom;
	let labelTo = -1;
	while (at < to) {
		const match = matchMarkdownEscape(raw, at);
		if (match) {
			at += match.source.length;
			continue;
		}
		const char = raw[at];
		if (char === "`") {
			const code = scanCode(raw, at, to);
			at = code ? code.end : at + backtickRun(raw, at, to);
			continue;
		}
		if (char === "[") depth += 1;
		if (char === "]") {
			if (depth === 0) {
				labelTo = at;
				break;
			}
			depth -= 1;
		}
		at += 1;
	}
	if (labelTo === -1 || raw[labelTo + 1] !== "(") return null;

	const urlFrom = labelTo + 2;
	let parens = 0;
	let urlTo = -1;
	at = urlFrom;
	while (at < to) {
		const match = matchMarkdownEscape(raw, at);
		if (match) {
			at += match.source.length;
			continue;
		}
		const char = raw[at];
		if (char === undefined || /\s/u.test(char)) return null;
		if (char === "(") parens += 1;
		if (char === ")") {
			if (parens === 0) {
				urlTo = at;
				break;
			}
			parens -= 1;
		}
		at += 1;
	}
	if (urlTo === -1) return null;
	const url = decodeRange(raw, urlFrom, urlTo);
	if (url === "") return null;

	const label = tokenizeMarkdown(raw, labelFrom, labelTo, true);
	const text = tokensText(label);
	if (text === "") return null;
	return {
		token: image
			? { kind: "image", url, alt: text }
			: { kind: "link", url, children: label },
		end: urlTo + 1,
	};
}

function tokenizeMarkdown(
	raw: string,
	from: number,
	to: number,
	inLabel: boolean,
): ParseToken[] {
	const tokens: ParseToken[] = [];
	let text = "";
	const flush = () => {
		if (text !== "") tokens.push({ kind: "text", text });
		text = "";
	};
	const push = (token: ParseToken) => {
		flush();
		tokens.push(token);
	};

	let index = from;
	while (index < to) {
		const match = matchMarkdownEscape(raw, index);
		if (match && index + match.source.length <= to) {
			text += match.decoded;
			index += match.source.length;
			continue;
		}
		const char = raw[index];
		const next = raw[index + 1];
		if (char === "`") {
			const code = scanCode(raw, index, to);
			if (code) {
				push({ kind: "code", text: code.text });
				index = code.end;
			} else {
				const run = backtickRun(raw, index, to);
				text += raw.slice(index, index + run);
				index += run;
			}
			continue;
		}
		if ((char === "*" || char === "~") && next === char && index + 2 <= to) {
			const mark = char === "*" ? "bold" : "strikethrough";
			push(delimiterToken(raw, index, from, to, mark, `${char}${char}`));
			index += 2;
			continue;
		}
		if (char === "_") {
			push(delimiterToken(raw, index, from, to, "italic", "_"));
			index += 1;
			continue;
		}
		if (raw.startsWith("<u>", index) && index + 3 <= to) {
			push({
				kind: "delimiter",
				mark: "underline",
				raw: "<u>",
				canOpen: true,
				canClose: false,
			});
			index += 3;
			continue;
		}
		if (raw.startsWith("</u>", index) && index + 4 <= to) {
			push({
				kind: "delimiter",
				mark: "underline",
				raw: "</u>",
				canOpen: false,
				canClose: true,
			});
			index += 4;
			continue;
		}
		if (!inLabel && (char === "[" || (char === "!" && next === "["))) {
			const link = scanLink(raw, index, to, char === "!");
			if (link) {
				push(link.token);
				index = link.end;
				continue;
			}
		}
		text += char;
		index += 1;
	}
	flush();
	return tokens;
}

// Any character that can begin inline syntax. A cell holding none of them is
// only escapes, and decoding them is all a parse would do.
const INLINE_SYNTAX = /[*_~`[<]/;

// One trimmed Markdown cell, as the table's canonical content.
export function parseMarkdownCell(raw: string): TextContent {
	if (!INLINE_SYNTAX.test(raw)) return unescapeCell(raw);
	return inlineFromTokens(tokenizeMarkdown(raw, 0, raw.length, false));
}

// Writing

// A destination is written with every character that could end it, split the
// row, or begin an escape spelled out, so the authored URL comes back exactly.
function escapeDestination(url: string): string {
	let out = "";
	for (const char of normalizeBreaks(url)) {
		if (char === "\\") out += "\\\\";
		else if (char === "|") out += "\\|";
		else if (char === "&") out += "&amp;";
		else if (char === "(" || char === ")" || char === "<") out += `\\${char}`;
		else if (/\s/u.test(char)) out += numericEntity(char);
		else out += char;
	}
	return out;
}

const DELIMITERS: Record<DelimitedMark, readonly [string, string]> = {
	bold: ["**", "**"],
	italic: ["_", "_"],
	underline: ["<u>", "</u>"],
	strikethrough: ["~~", "~~"],
};

// How a line break inside a cell is written (#397): the decimal character
// reference by default, which CommonMark reads as a reference rather than as
// raw HTML, so no renderer shows markup; `<br>` when the reader chose it, for
// renderers that draw it as a visible break. The decoder reads both, and any
// other break spelling it knows, whichever is chosen here.
const LINE_BREAK_REFERENCE = "&#10;";
const LINE_BREAK_TAG = "<br>";

function spellLiteral(
	tokens: readonly OutToken[],
	index: number,
	lineBreak: string,
): string {
	const token = tokens[index];
	if (token?.kind !== "literal") return "";
	const { char, zone } = token;
	switch (char) {
		case "\\":
			return "\\\\";
		case "|":
			return "\\|";
		case "&":
			return "&amp;";
		case "`":
			return "\\`";
		case "\n":
			return lineBreak;
		case "<": {
			// Every spelling the decoder recognises has to be escaped here, or a
			// literal `<br/>` typed by the user would come back as a line break,
			// and a literal `<u>` as underline.
			const ahead = literalsAhead(tokens, index, 5);
			const spelled = `<${ahead}`;
			if (
				breakSpellingAt(spelled, 0) ||
				(zone !== "code" &&
					(spelled.startsWith("<u>") || spelled.startsWith("</u>")))
			) {
				return "\\<";
			}
			return "<";
		}
	}
	if (zone === "code") return char;
	switch (char) {
		case "*":
		case "~":
			// Only a doubled marker is syntax, so a single one stays as it is
			// unless something beside it would double it.
			return neighbourChar(tokens, index, -1) === char ||
				neighbourChar(tokens, index, 1) === char
				? `\\${char}`
				: char;
		case "_":
			return neighbourClass(tokens, index, -1) === "alnum" &&
				neighbourClass(tokens, index, 1) === "alnum"
				? "_"
				: "\\_";
		case "[":
			return "\\[";
		case "]":
			return zone === "label" || zone === "alt" ? "\\]" : "]";
		case "!":
			return neighbourChar(tokens, index, 1) === "[" ? "\\!" : "!";
		default:
			return char;
	}
}

function markdownGrammar(lineBreak: string): TextGrammar {
	return {
		delimiter: (mark, role) => DELIMITERS[mark][role === "open" ? 0 : 1],
		flanking: (mark) => ({
			inner: mark !== "underline",
			outer: mark === "italic",
		}),
		codeOpen: "`",
		codeClose: "`",
		linkOpen: "[",
		linkClose: (url) => `](${escapeDestination(url)})`,
		imageOpen: () => "![",
		imageClose: (url) => `](${escapeDestination(url)})`,
		protectsEdges: true,
		spell: (tokens, index) => spellLiteral(tokens, index, lineBreak),
	};
}

const referenceGrammar = markdownGrammar(LINE_BREAK_REFERENCE);
const tagGrammar = markdownGrammar(LINE_BREAK_TAG);

// Markdown cannot hold a literal pipe or line break inside a table cell, so
// both are escaped rather than dropped, and so is every character the inline
// syntax would otherwise read. The transformation must be exactly reversible:
// see docs/adr/0002 and docs/adr/0011.
export function writeMarkdownCell(
	value: TextContent,
	lineBreakTags = false,
): string {
	return writeInline(value, lineBreakTags ? tagGrammar : referenceGrammar);
}

export function escapeCell(value: string, lineBreakTags = false): string {
	return writeMarkdownCell(value, lineBreakTags);
}
