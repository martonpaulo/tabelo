import type { TextContent } from "@/core/types";
import {
	classOf,
	codePointAt,
	codePointBefore,
	type DelimitedMark,
	decodableEntity,
	inlineFromTokens,
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

// One Jira table cell's content: the escape grammar Tabelo has always written,
// and the inline syntax of Atlassian's wiki markup that docs/adr/0011 carries:
//
//   *bold*  _italic_  +underline+  -strikethrough-  {{code}}
//   [label|url]  !url|alt=alternative text!
//
// A marker opens only at the start of a word and closes only at its end, as
// Jira's renderer reads them, so `2020-01-01` and `snake_case` stay text. A
// marker that does not complete its construct stays exactly what it was.
// Atlassian documents the syntax here:
// https://confluence.atlassian.com/conf101/confluence-wiki-markup-1652924946.html

// The punctuation a backslash makes literal, as Jira's renderer reads it. A
// doubled backslash is the forced line break and a literal backslash is
// `&#92;`, so neither is here.
const BACKSLASH_ESCAPABLE = new Set([
	"|",
	"*",
	"_",
	"+",
	"-",
	"{",
	"}",
	"[",
	"]",
	"!",
]);

const ENTITY = /&#([0-9]+);/y;

// The one reader of Jira's escape grammar, at one offset. Longest match first,
// so `&#92;` is recognized before the backslash it restores could be read as
// the start of another sequence. The decoder below and the source view's escape
// glyphs both read this, which is what keeps the editor from becoming a second
// parser. What a match reports is never examined again, so literal entity-like
// user text stays literal and reversible.
export const matchJiraEscape: EscapeMatcher = (value, index) => {
	switch (value[index]) {
		case "\\": {
			if (value.startsWith("\\\\", index)) {
				return { source: "\\\\", decoded: "\n", kind: "line-break" };
			}
			const next = value[index + 1];
			if (next !== undefined && BACKSLASH_ESCAPABLE.has(next)) {
				return { source: `\\${next}`, decoded: next, kind: "character" };
			}
			break;
		}
		case "&": {
			if (value.startsWith("&#92;", index)) {
				return { source: "&#92;", decoded: "\\", kind: "character" };
			}
			if (value.startsWith("&amp;", index)) {
				return { source: "&amp;", decoded: "&", kind: "character" };
			}
			// Whitespace a mark must not start or end on, and a letter or digit a
			// marker must not touch, are written as references (docs/adr/0011).
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
						kind: decodable.whitespace ? "whitespace" : "character",
					};
				}
			}
			break;
		}
	}
	return null;
};

export function unescapeJiraCell(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === undefined) break;
		// Scan the serialized source once. Restored output is never examined
		// again, which keeps literal entity-like user text reversible.
		const match = matchJiraEscape(value, index);
		if (match) {
			out += match.decoded;
			index += match.source.length - 1;
			continue;
		}
		out += char;
	}
	return out;
}

// Constructs

// Where the unescaped `stop` character after `from` sits on the line, or -1.
function unescapedIndex(line: string, from: number, stop: string): number {
	for (let index = from; index < line.length; index += 1) {
		const char = line[index];
		if (char === "\\" && index + 1 < line.length) {
			index += 1;
			continue;
		}
		if (char === stop) return index;
	}
	return -1;
}

const IMAGE_PARAMETER = "|alt=";

// A link or an image whose own separator is a bare pipe. Jira reads both
// before it splits a table row, so the row splitter and the cell parser have
// to agree on exactly where they end, and this is the one place that says:
//
//   [label|url]         a bracket, a bare pipe inside, the closing bracket
//   !url|alt=text!      a URL with no whitespace, `|alt=`, the closing `!`
//
// Anything else is not a construct, and its pipes split the row as ever.
export function jiraConstructEnd(line: string, index: number): number | null {
	const char = line[index];
	if (char === "[") {
		const close = unescapedIndex(line, index + 1, "]");
		if (close === -1) return null;
		const pipe = unescapedIndex(line.slice(0, close), index + 1, "|");
		return pipe === -1 ? null : close + 1;
	}
	if (char === "!") {
		let at = index + 1;
		while (at < line.length) {
			const current = line[at];
			if (current === "\\" && at + 1 < line.length) {
				at += 2;
				continue;
			}
			if (current === undefined || /[\s|\]!]/u.test(current)) break;
			at += 1;
		}
		if (at === index + 1 || !line.startsWith(IMAGE_PARAMETER, at)) return null;
		const close = unescapedIndex(line, at + IMAGE_PARAMETER.length, "!");
		return close === -1 ? null : close + 1;
	}
	return null;
}

// Parsing

// A marker opens before non-whitespace when no letter or digit precedes it, and
// closes after non-whitespace when no letter or digit follows it.
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
	const beforeClass = classOf(before);
	const afterClass = classOf(after);
	return {
		kind: "delimiter",
		mark,
		raw: spelling,
		canOpen:
			afterClass !== "none" &&
			afterClass !== "space" &&
			beforeClass !== "alnum",
		canClose:
			beforeClass !== "none" &&
			beforeClass !== "space" &&
			afterClass !== "alnum",
	};
}

const MARKERS: Record<string, DelimitedMark> = {
	"*": "bold",
	_: "italic",
	"+": "underline",
	"-": "strikethrough",
};

function scanCode(
	raw: string,
	index: number,
	to: number,
): { readonly text: string; readonly end: number } | null {
	let text = "";
	let at = index + 2;
	while (at < to) {
		const match = matchJiraEscape(raw, at);
		if (match && at + match.source.length <= to) {
			text += match.decoded;
			at += match.source.length;
			continue;
		}
		if (raw.startsWith("}}", at) && at + 2 <= to) {
			if (text === "" || /[\r\n]/.test(text)) return null;
			return { text, end: at + 2 };
		}
		text += raw[at];
		at += 1;
	}
	return null;
}

function parseConstruct(
	raw: string,
	index: number,
	end: number,
): ParseToken | null {
	if (raw[index] === "[") {
		const pipe = unescapedIndex(raw.slice(0, end - 1), index + 1, "|");
		const url = unescapeJiraCell(raw.slice(pipe + 1, end - 1));
		if (url === "") return null;
		const label = tokenizeJira(raw, index + 1, pipe, true);
		if (tokensText(label) === "") return null;
		return { kind: "link", url, children: label };
	}
	const parameter = raw.indexOf(IMAGE_PARAMETER, index);
	const url = unescapeJiraCell(raw.slice(index + 1, parameter));
	const alt = unescapeJiraCell(
		raw.slice(parameter + IMAGE_PARAMETER.length, end - 1),
	);
	if (url === "" || alt === "") return null;
	return { kind: "image", url, alt };
}

function tokenizeJira(
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
		const match = matchJiraEscape(raw, index);
		if (match && index + match.source.length <= to) {
			text += match.decoded;
			index += match.source.length;
			continue;
		}
		const char = raw[index] ?? "";
		if (raw.startsWith("{{", index) && index + 2 <= to) {
			const code = scanCode(raw, index, to);
			if (code) {
				push({ kind: "code", text: code.text });
				index = code.end;
				continue;
			}
		}
		const mark = MARKERS[char];
		if (mark) {
			push(delimiterToken(raw, index, from, to, mark, char));
			index += 1;
			continue;
		}
		if (!inLabel && (char === "[" || char === "!")) {
			const end = jiraConstructEnd(raw.slice(0, to), index);
			const token = end === null ? null : parseConstruct(raw, index, end);
			if (end !== null && token) {
				push(token);
				index = end;
				continue;
			}
		}
		text += char;
		index += 1;
	}
	flush();
	return tokens;
}

const INLINE_SYNTAX = /[*_+\-{[!]/;

// One Jira cell, as the table's canonical content.
export function parseJiraCell(raw: string): TextContent {
	if (!INLINE_SYNTAX.test(raw)) return unescapeJiraCell(raw);
	return inlineFromTokens(tokenizeJira(raw, 0, raw.length, false));
}

// Writing

// A URL is written with every character that could end its construct, split
// the row, or begin an escape spelled out, so it comes back exactly.
function escapeUrl(url: string): string {
	let out = "";
	for (const char of normalizeBreaks(url)) {
		if (char === "&") out += "&amp;";
		else if (char === "\\") out += "&#92;";
		else if (char === "|" || char === "]" || char === "!" || char === "[") {
			out += `\\${char}`;
		} else if (/\s/u.test(char)) out += numericEntity(char);
		else out += char;
	}
	return out;
}

const DELIMITERS: Record<DelimitedMark, string> = {
	bold: "*",
	italic: "_",
	underline: "+",
	strikethrough: "-",
};

const MARKER_CHARS = new Set(Object.keys(MARKERS));

function flanks(tokens: readonly OutToken[], index: number) {
	const before = neighbourClass(tokens, index, -1);
	const after = neighbourClass(tokens, index, 1);
	return {
		opens: after !== "none" && after !== "space" && before !== "alnum",
		closes: before !== "none" && before !== "space" && after !== "alnum",
	};
}

// A literal marker is written as it is unless the parser could pair it: when
// it could open and a closer for its mark follows, or could close and an
// opener precedes. That keeps `2020-01-01`, `-5`, and `a - b` as they read.
function markerNeedsEscape(
	tokens: readonly OutToken[],
	index: number,
): boolean {
	const token = tokens[index];
	if (token?.kind !== "literal") return false;
	const mark = MARKERS[token.char];
	const { opens, closes } = flanks(tokens, index);
	const sameMark = (at: number, role: "opens" | "closes") => {
		const other = tokens[at];
		if (other?.kind === "delimiter") return other.mark === mark;
		return (
			other?.kind === "literal" &&
			!other.entity &&
			other.char === token.char &&
			flanks(tokens, at)[role]
		);
	};
	if (opens) {
		for (let at = index + 1; at < tokens.length; at += 1) {
			if (sameMark(at, "closes")) return true;
		}
	}
	if (closes) {
		for (let at = index - 1; at >= 0; at -= 1) {
			if (sameMark(at, "opens")) return true;
		}
	}
	return false;
}

function spellLiteral(tokens: readonly OutToken[], index: number): string {
	const token = tokens[index];
	if (token?.kind !== "literal") return "";
	const { char, zone } = token;
	switch (char) {
		case "&":
			return "&amp;";
		case "\\":
			return "&#92;";
		case "|":
			return "\\|";
		case "\n":
			return "\\\\";
	}
	if (zone === "alt") return char === "!" ? "\\!" : char;
	if (MARKER_CHARS.has(char)) {
		return markerNeedsEscape(tokens, index) ? `\\${char}` : char;
	}
	switch (char) {
		case "{":
		case "}":
			if (zone === "code") return `\\${char}`;
			return neighbourChar(tokens, index, -1) === char ||
				neighbourChar(tokens, index, 1) === char
				? `\\${char}`
				: char;
		case "[":
			return "\\[";
		case "]":
			return zone === "label" || zone === "code" ? "\\]" : "]";
		case "!": {
			// Jira reads `!` followed by a word as the start of an image, so one
			// that ends a sentence stays as it is and any other is protected.
			const after = neighbourClass(tokens, index, 1);
			return after === "alnum" || after === "other" ? "\\!" : "!";
		}
		default:
			return char;
	}
}

const jiraGrammar: TextGrammar = {
	delimiter: (mark) => DELIMITERS[mark],
	flanking: () => ({ inner: true, outer: true }),
	codeOpen: "{{",
	codeClose: "}}",
	linkOpen: "[",
	linkClose: (url) => `|${escapeUrl(url)}]`,
	imageOpen: (url) => `!${escapeUrl(url)}${IMAGE_PARAMETER}`,
	imageClose: () => "!",
	// Jira pads nothing, so a cell's surrounding space is its own.
	protectsEdges: false,
	spell: spellLiteral,
};

// Like Markdown, Jira's rows are line-delimited and pipe-delimited, so pipes and
// newlines inside a cell are escaped reversibly, and so is every character the
// inline syntax would otherwise read. Jira renders `\\` as a forced line break,
// the closest equivalent to Markdown's `<br>`, and a Jira defect records
// `&#92;` as the compatible literal-backslash spelling:
// https://jira.atlassian.com/browse/JRASERVER-76901
export function writeJiraCell(value: TextContent): string {
	return writeInline(value, jiraGrammar);
}

export function escapeJiraCell(value: string): string {
	return writeJiraCell(value);
}
