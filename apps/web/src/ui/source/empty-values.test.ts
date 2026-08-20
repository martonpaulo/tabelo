import { describe, expect, it } from "vitest";
import { csvCodec } from "@/formats/csv";
import { jiraCodec } from "@/formats/jira";
import { jsonCodec } from "@/formats/json";
import { tsvCodec } from "@/formats/tsv";
import {
	emptyValueSyntax,
	jiraEmptyOffsets,
	scanDelimitedLine,
} from "./empty-values";

// The markers only ever describe what a codec would read, so every case here
// states the fields the format's own parser finds and then asserts which of
// them are invisible in the text.

describe("emptyValueSyntax", () => {
	it("reads the separator a delimited view's codec declares", () => {
		expect(emptyValueSyntax("delimited", csvCodec.fieldSeparator)).toEqual({
			kind: "delimited",
			separator: ",",
		});
		expect(emptyValueSyntax("delimited", tsvCodec.fieldSeparator)).toEqual({
			kind: "delimited",
			separator: "\t",
		});
	});

	it("marks nothing where a format spells an empty value out", () => {
		expect(emptyValueSyntax("json", jsonCodec.fieldSeparator)).toBeNull();
		expect(emptyValueSyntax("records", undefined)).toBeNull();
		expect(emptyValueSyntax("html", undefined)).toBeNull();
		expect(emptyValueSyntax("plain", undefined)).toBeNull();
	});

	it("marks the pipe syntaxes without needing a separator", () => {
		expect(emptyValueSyntax("markdown", undefined)).toEqual({
			kind: "markdown",
		});
		expect(emptyValueSyntax("jira", jiraCodec.fieldSeparator)).toEqual({
			kind: "jira",
		});
	});
});

describe("scanDelimitedLine", () => {
	const scan = (line: string, separator = ",", inQuotes = false) =>
		scanDelimitedLine(line, separator, inQuotes);

	it("marks an empty field between two separators", () => {
		expect(scan("a,,b").offsets).toEqual([2]);
	});

	it("marks empty fields at both ends of a row", () => {
		expect(scan(",q,").offsets).toEqual([0, 3]);
	});

	it("marks every empty field in a run", () => {
		expect(scan("a,,,b").offsets).toEqual([2, 3]);
	});

	it("leaves a quoted empty value alone, because it is already visible", () => {
		expect(scan('a,"",b').offsets).toEqual([]);
	});

	it("does not read a separator inside a quoted value as structure", () => {
		expect(scan('"a,,b",c').offsets).toEqual([]);
	});

	it("treats a doubled quote as an escaped quote rather than a boundary", () => {
		expect(scan('"a""b",,c').offsets).toEqual([7]);
	});

	it("carries an unterminated quoted value into the next line", () => {
		const opening = scan('a,"line one');
		expect(opening.endsInQuotes).toBe(true);
		expect(scan('line two",,b', ",", true).offsets).toEqual([10]);
	});

	it("says nothing about a line with no structure at all", () => {
		expect(scan("").offsets).toEqual([]);
		expect(scan("a plain sentence").offsets).toEqual([]);
	});

	it("uses the separator it is given rather than any comma it finds", () => {
		expect(scan("a,b\t\tc", "\t").offsets).toEqual([4]);
		expect(scan("a\tb", ",").offsets).toEqual([]);
	});

	it("agrees with the delimited codec about how many fields a row has", () => {
		const line = ",a,,b,";
		const parsed = csvCodec.parseMatrix(`h1,h2,h3,h4,h5\n${line}`);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const row = parsed.table.matrix[1] ?? [];
		const empty = row.filter((cell) => cell === "").length;
		expect(scan(line).offsets).toHaveLength(empty);
	});
});

describe("jiraEmptyOffsets", () => {
	it("marks an empty cell in a body row", () => {
		expect(jiraEmptyOffsets("|x||z|")).toEqual([3]);
	});

	it("reads a header line's doubled pipes as one delimiter", () => {
		expect(jiraEmptyOffsets("||a||b||")).toEqual([]);
		expect(jiraEmptyOffsets("||a|||b||")).toEqual([5]);
	});

	it("marks a header of only empty cells", () => {
		expect(jiraEmptyOffsets("||||")).toEqual([2]);
	});

	it("does not read an escaped pipe as a delimiter", () => {
		expect(jiraEmptyOffsets("|a\\|b|c|")).toEqual([]);
	});

	it("says nothing about a line with no pipes", () => {
		expect(jiraEmptyOffsets("")).toEqual([]);
		expect(jiraEmptyOffsets("a plain sentence")).toEqual([]);
	});

	it("agrees with the Jira codec about how many cells a row has", () => {
		const source = "||a|||b||\n|x||z|";
		const parsed = jiraCodec.parseMatrix(source);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const lines = source.split("\n");
		for (const [index, row] of parsed.table.matrix.entries()) {
			const empty = row.filter((cell) => cell === "").length;
			expect(jiraEmptyOffsets(lines[index] ?? "")).toHaveLength(empty);
		}
	});
});
