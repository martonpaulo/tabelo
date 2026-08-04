import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { csvCodec } from "./csv";
import { escapeCell, markdownCodec, unescapeCell } from "./markdown";

// The escaping contract from docs/adr/0002 is the one thing in this project
// that must never regress: a value has to survive the round trip byte-exact.

describe("markdown cell escaping", () => {
	const hostile = [
		"plain",
		"",
		"has | pipe",
		"line one\nline two",
		"back\\slash",
		"literal <br> tag",
		"already \\| escaped",
		"trailing backslash \\",
		"everything | \n \\ <br> at once",
		"<br/>",
		"<br />",
		"|||",
		"\\\\",
		"  leading and trailing  ",
	];

	it.each(hostile)("round-trips %j", (value) => {
		expect(unescapeCell(escapeCell(value))).toBe(value);
	});

	it("never emits a bare pipe that would split a row", () => {
		const escaped = escapeCell("a | b");
		const unescapedPipes = escaped.replace(/\\\|/g, "");
		expect(unescapedPipes).not.toContain("|");
	});

	it("normalizes CRLF to a single break", () => {
		expect(unescapeCell(escapeCell("one\r\ntwo"))).toBe("one\ntwo");
	});
});

describe("markdown parsing", () => {
	it("reads a table with alignment markers", () => {
		const result = markdownCodec.parse(
			[
				"| Name | Role | Active |",
				"| :--- | :---: | ---: |",
				"| Ingrid | Designer | Yes |",
			].join("\n"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.document.columns.map((column) => column.header)).toEqual([
			"Name",
			"Role",
			"Active",
		]);
		expect(result.document.columns.map((column) => column.align)).toEqual([
			"left",
			"center",
			"right",
		]);
		expect(result.document.rows).toHaveLength(1);
	});

	it("keeps an escaped pipe inside one cell", () => {
		const result = markdownCodec.parse(
			"| A | B |\n| --- | --- |\n| x \\| y | z |",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const [row] = result.document.rows;
		const firstColumn = result.document.columns[0];
		expect(row.cells[firstColumn.id]).toBe("x | y");
		expect(result.document.columns).toHaveLength(2);
	});

	it("rejects a table that has no divider row yet", () => {
		const result = markdownCodec.parse("| Name | Role |");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].code).toBe("markdown-table-incomplete");
	});

	it("rejects a divider whose column count disagrees with the header", () => {
		const result = markdownCodec.parse("| A | B | C |\n| --- | --- |");
		expect(result.ok).toBe(false);
	});

	it("reports ragged rows as warnings but keeps the data", () => {
		const result = markdownCodec.parse(
			"| A | B |\n| --- | --- |\n| only-one |",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings?.length).toBeGreaterThan(0);
		expect(result.document.rows).toHaveLength(1);
	});

	it("tolerates rows written without outer pipes", () => {
		const result = markdownCodec.parse("A | B\n--- | ---\n1 | 2");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.document.columns).toHaveLength(2);
	});
});

describe("markdown serialization", () => {
	it("emits the alignment it parsed", () => {
		const source = "| A | B |\n| :-- | --: |\n| 1 | 2 |";
		const parsed = markdownCodec.parse(source);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const out = markdownCodec.serialize(parsed.document);
		expect(out.split("\n")[1]).toMatch(/\|\s*:-+\s*\|\s*-+:\s*\|/);
	});

	it("survives a full document round trip", () => {
		const document = documentFromMatrix(
			[
				["Name", "Note"],
				["Ingrid", "line one\nline two"],
				["Paulo", "a | b"],
			],
			{ headerRow: true },
		);

		const reparsed = markdownCodec.parse(markdownCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;

		expect(documentToMatrix(reparsed.document)).toEqual(
			documentToMatrix(document),
		);
	});
});

describe("cross-format round trip", () => {
	// The promise the product makes: moving between representations never
	// changes the data, even for values one of them cannot hold literally.
	it("keeps CSV values byte-exact through Markdown and back", () => {
		const original = [
			["Name", "Note", "Amount"],
			["Ingrid", "line one\nline two", "1,5"],
			["Paulo", 'he said "hi"', ""],
			["Cleo", "a | b", "-3"],
		];

		const document = documentFromMatrix(original, { headerRow: true });

		const asMarkdown = markdownCodec.serialize(document);
		const backFromMarkdown = markdownCodec.parse(asMarkdown);
		expect(backFromMarkdown.ok).toBe(true);
		if (!backFromMarkdown.ok) return;

		const asCsv = csvCodec.serialize(backFromMarkdown.document);
		const backFromCsv = csvCodec.parse(asCsv);
		expect(backFromCsv.ok).toBe(true);
		if (!backFromCsv.ok) return;

		expect(documentToMatrix(backFromCsv.document)).toEqual(original);
	});
});
