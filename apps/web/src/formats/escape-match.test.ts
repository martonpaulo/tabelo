import { describe, expect, it } from "vitest";
import { escapeJiraCell, matchJiraEscape, unescapeJiraCell } from "./jira";
import { escapeCell, matchMarkdownEscape, unescapeCell } from "./markdown";
import type { EscapeMatcher } from "./types";

// The matchers are the single description of each format's escape grammar: the
// decoders restore a cell through them, and the source views draw over exactly
// the ranges they report. So every case here pairs a matcher with the
// serializer that writes the sequence, rather than restating the grammar.

// Walks serialized text the way both readers do, one pass, and rebuilds the
// original from what the matches report. Anything the matcher misses or
// over-consumes shows up as a value that does not come back.
function decodeThroughMatcher(text: string, matcher: EscapeMatcher): string {
	let out = "";
	for (let index = 0; index < text.length; index += 1) {
		const match = matcher(text, index);
		if (match) {
			out += match.decoded;
			index += match.source.length - 1;
			continue;
		}
		out += text[index];
	}
	return out;
}

describe("matchMarkdownEscape", () => {
	const cases = [
		{ value: " leading", sequence: "&#32;", decoded: " ", kind: "whitespace" },
		{ value: "trailing ", sequence: "&#32;", decoded: " ", kind: "whitespace" },
		{ value: "\ttab", sequence: "&#9;", decoded: "\t", kind: "whitespace" },
		{
			value: "\u00a0nbsp",
			sequence: "&#160;",
			decoded: "\u00a0",
			kind: "whitespace",
		},
		{ value: "a|b", sequence: "\\|", decoded: "|", kind: "character" },
		{ value: "a\\b", sequence: "\\\\", decoded: "\\", kind: "character" },
		{ value: "a&b", sequence: "&amp;", decoded: "&", kind: "character" },
		{ value: "a\nb", sequence: "<br>", decoded: "\n", kind: "line-break" },
		{ value: "a<br>b", sequence: "\\<br>", decoded: "<br>", kind: "character" },
		{
			value: "a<br/>b",
			sequence: "\\<br/>",
			decoded: "<br/>",
			kind: "character",
		},
		{
			value: "a<br />b",
			sequence: "\\<br />",
			decoded: "<br />",
			kind: "character",
		},
	] as const;

	it.each(cases)(
		"recognizes what the serializer writes for $value",
		({ value, sequence, decoded, kind }) => {
			const serialized = escapeCell(value);
			expect(serialized).toContain(sequence);
			const at = serialized.indexOf(sequence);
			expect(matchMarkdownEscape(serialized, at)).toEqual({
				source: sequence,
				decoded,
				kind,
			});
		},
	);

	it("reports nothing where a character begins no sequence", () => {
		expect(matchMarkdownEscape("plain", 0)).toBeNull();
		// The openers, on their own and unfollowed by a grammar the decoder
		// knows: each stays one ordinary character.
		expect(matchMarkdownEscape("a & b", 2)).toBeNull();
		expect(matchMarkdownEscape("a \\ b", 2)).toBeNull();
		expect(matchMarkdownEscape("a < b", 2)).toBeNull();
		// An entity for a character that is not whitespace is not one of the
		// sequences the serializer writes.
		expect(matchMarkdownEscape("&#65;", 0)).toBeNull();
		expect(matchMarkdownEscape("&#13;", 0)).toBeNull();
	});

	it("takes the longest spelling before a shorter one it starts with", () => {
		expect(matchMarkdownEscape("<br />", 0)?.source).toBe("<br />");
		expect(matchMarkdownEscape("\\<br />", 0)?.source).toBe("\\<br />");
		expect(matchMarkdownEscape("\\<br/>", 0)?.source).toBe("\\<br/>");
	});

	it("leaves a protected literal literal after its ampersand", () => {
		const serialized = escapeCell("&#32;");
		expect(serialized).toBe("&amp;#32;");
		// One sequence on the line, the protected ampersand. What it restores is
		// never scanned again, so the `#32;` after it is the user's own text.
		expect(matchMarkdownEscape(serialized, 0)).toEqual({
			source: "&amp;",
			decoded: "&",
			kind: "character",
		});
		expect(matchMarkdownEscape(serialized, 5)).toBeNull();
		expect(unescapeCell(serialized)).toBe("&#32;");
	});

	it.each([
		" spaced ",
		"\tstart",
		"end\u00a0",
		"a|b\\c&d",
		"line\nbreak",
		"<br>",
		"&amp;",
		"&#32;",
		"\\|",
		"plain text",
	])("rebuilds %j from the matches alone", (value) => {
		expect(decodeThroughMatcher(escapeCell(value), matchMarkdownEscape)).toBe(
			value,
		);
	});
});

describe("matchJiraEscape", () => {
	const cases = [
		{ value: "a|b", sequence: "\\|", decoded: "|", kind: "character" },
		{ value: "a\\b", sequence: "&#92;", decoded: "\\", kind: "character" },
		{ value: "a&b", sequence: "&amp;", decoded: "&", kind: "character" },
		{ value: "a\nb", sequence: "\\\\", decoded: "\n", kind: "line-break" },
	] as const;

	it.each(cases)(
		"recognizes what the serializer writes for $value",
		({ value, sequence, decoded, kind }) => {
			const serialized = escapeJiraCell(value);
			const at = serialized.indexOf(sequence);
			expect(at).toBeGreaterThanOrEqual(0);
			expect(matchJiraEscape(serialized, at)).toEqual({
				source: sequence,
				decoded,
				kind,
			});
		},
	);

	it("reports nothing where a character begins no sequence", () => {
		expect(matchJiraEscape("plain", 0)).toBeNull();
		expect(matchJiraEscape("a & b", 2)).toBeNull();
		expect(matchJiraEscape("a \\ b", 2)).toBeNull();
		// Jira has no whitespace entity of its own, so this one is user text.
		expect(matchJiraEscape("&#32;", 0)).toBeNull();
	});

	it("leaves a protected literal literal after its ampersand", () => {
		const serialized = escapeJiraCell("&#92;");
		expect(serialized).toBe("&amp;#92;");
		expect(matchJiraEscape(serialized, 0)?.source).toBe("&amp;");
		expect(matchJiraEscape(serialized, 5)).toBeNull();
		expect(unescapeJiraCell(serialized)).toBe("&#92;");
	});

	it.each(["a|b", "a\\b", "a&b", "a\nb", "&amp;", "&#92;", "plain text"])(
		"rebuilds %j from the matches alone",
		(value) => {
			expect(decodeThroughMatcher(escapeJiraCell(value), matchJiraEscape)).toBe(
				value,
			);
		},
	);
});
