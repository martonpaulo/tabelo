import { describe, expect, it } from "vitest";
import { escapeCell } from "@/formats/markdown";
import {
	escapeAt,
	escapeGlyph,
	escapeSyntax,
	scanEscapes,
} from "./escape-sequences";

// The glyphs only ever describe what a codec wrote, so every case here starts
// from serialized text and asserts which runs of it are notation rather than
// content, and how wide each run is.

describe("escapeSyntax", () => {
	it("draws escapes for the formats whose codecs escape inside a cell", () => {
		expect(escapeSyntax("markdown")).toBe("markdown");
		expect(escapeSyntax("jira")).toBe("jira");
	});

	it("draws nothing where a format has no escape grammar of its own", () => {
		for (const language of [
			"delimited",
			"html",
			"json",
			"records",
			"plain",
		] as const) {
			expect(escapeSyntax(language)).toBeNull();
		}
	});
});

describe("scanEscapes", () => {
	it("finds every sequence in a serialized Markdown row, with its width", () => {
		const line = `| ${escapeCell("a|b")} | ${escapeCell("trailing ")} |`;
		const found = scanEscapes(line, "markdown");
		expect(found.map(({ match }) => match.source)).toEqual(["\\|", "&#32;"]);
		// The run each glyph is drawn instead of, which is the room Markdown
		// already measured for it when it padded the column.
		expect(found.map(({ match }) => match.source.length)).toEqual([2, 5]);
		// Offsets address the line as written, so a decoration built from them
		// covers the notation and nothing beside it.
		for (const { offset, match } of found) {
			expect(line.slice(offset, offset + match.source.length)).toBe(
				match.source,
			);
		}
	});

	it("finds every sequence in a serialized Jira row", () => {
		const found = scanEscapes("|a\\|b|c&#92;d|e\\\\f|", "jira");
		expect(found.map(({ match }) => match.source)).toEqual([
			"\\|",
			"&#92;",
			"\\\\",
		]);
	});

	it("leaves a sequence that is not one alone", () => {
		// The literal text `&#32;` serializes with its ampersand protected. Only
		// that ampersand is notation; the rest is the value.
		const line = `| ${escapeCell("&#32;")} |`;
		const found = scanEscapes(line, "markdown");
		expect(found).toHaveLength(1);
		expect(found[0]?.match.source).toBe("&amp;");
		// Jira spells no whitespace entity, so the same run is content there.
		expect(scanEscapes("|&#32;|", "jira")).toHaveLength(0);
	});

	it("passes over a line once, never over what a match restored", () => {
		// `&amp;amp;` is the literal text `&amp;`: one sequence, not two.
		expect(scanEscapes("&amp;amp;", "markdown")).toHaveLength(1);
	});
});

describe("escapeGlyph", () => {
	it("shows what the sequence resolves to, not how it is spelled", () => {
		const glyphs = scanEscapes(
			`${escapeCell(" x")}${escapeCell("a|b")}${escapeCell("a\nb")}`,
			"markdown",
		).map(({ match }) => escapeGlyph(match));
		expect(glyphs).toEqual(["·", "|", "↵"]);
	});

	it("tells whitespace apart rather than calling it all a space", () => {
		const [space] = scanEscapes(escapeCell(" x"), "markdown");
		const [tab] = scanEscapes(escapeCell("\tx"), "markdown");
		const [nbsp] = scanEscapes(escapeCell("\u00a0x"), "markdown");
		const drawn = [space, tab, nbsp].map((found) =>
			found ? escapeGlyph(found.match) : null,
		);
		expect(new Set(drawn).size).toBe(3);
	});

	it("draws one character for a sequence that restores several", () => {
		const [found] = scanEscapes(escapeCell("<br>"), "markdown");
		expect(found?.match.decoded).toBe("<br>");
		expect(found && escapeGlyph(found.match)).toHaveLength(1);
	});
});

describe("escapeAt", () => {
	const line = `| ${escapeCell("trailing ")} |`;
	const start = line.indexOf("&#32;");

	it("answers for every column the sequence covers", () => {
		for (let column = start; column < start + 5; column += 1) {
			expect(escapeAt(line, column, "markdown")?.offset).toBe(start);
		}
	});

	it("answers for nothing outside it", () => {
		expect(escapeAt(line, start - 1, "markdown")).toBeNull();
		expect(escapeAt(line, start + 5, "markdown")).toBeNull();
	});
});
