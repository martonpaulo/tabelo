import { assert, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import { csvCodec } from "./csv";
import { escapeCell, markdownCodec, unescapeCell } from "./markdown";

// The escaping contract from docs/adr/0002 is the one thing in this project
// that must never regress: a value has to survive the round trip byte-exact.

const unicodeBoundaryWhitespace = [
	["0009", "\u0009"],
	["000A", "\u000a"],
	["000B", "\u000b"],
	["000C", "\u000c"],
	["0020", "\u0020"],
	["00A0", "\u00a0"],
	["1680", "\u1680"],
	["2000", "\u2000"],
	["2001", "\u2001"],
	["2002", "\u2002"],
	["2003", "\u2003"],
	["2004", "\u2004"],
	["2005", "\u2005"],
	["2006", "\u2006"],
	["2007", "\u2007"],
	["2008", "\u2008"],
	["2009", "\u2009"],
	["200A", "\u200a"],
	["2028", "\u2028"],
	["2029", "\u2029"],
	["202F", "\u202f"],
	["205F", "\u205f"],
	["3000", "\u3000"],
	["FEFF", "\ufeff"],
] as const;

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
		assert(row);
		assert(firstColumn);
		expect(row.cells[firstColumn.id]).toBe("x | y");
		expect(result.document.columns).toHaveLength(2);
	});

	it("rejects a table that has no divider row yet", () => {
		const result = markdownCodec.parse("| Name | Role |");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0]?.code).toBe("markdown-table-incomplete");
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

	it("treats ordinary hand-written padding as syntax", () => {
		const result = markdownCodec.parse(
			"| Name    | Note       |\n| ------- | ---------- |\n| Ingrid  | readable   |",
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)).toEqual([
			["Name", "Note"],
			["Ingrid", "readable"],
		]);
	});
});

describe("markdown serialization", () => {
	it.each([
		{
			case: "ASCII",
			matrix: [["ASCII"], ["text"]],
			expected: ["| ASCII |", "| ----- |", "| text  |"].join("\n"),
		},
		{
			case: "CJK",
			matrix: [["CJK"], ["東京"]],
			expected: ["| CJK  |", "| ---- |", "| 東京 |"].join("\n"),
		},
		{
			case: "an emoji ZWJ sequence",
			matrix: [["Icon"], ["👩‍💻"]],
			expected: ["| Icon |", "| ---- |", "| 👩‍💻   |"].join("\n"),
		},
		{
			case: "a combining accent",
			matrix: [["Mark"], ["e\u0301"]],
			expected: ["| Mark |", "| ---- |", "| e\u0301    |"].join("\n"),
		},
		{
			case: "mixed display widths",
			matrix: [
				["Type", "Value"],
				["CJK", "東京"],
				["Emoji", "👩‍💻"],
				["Accent", "e\u0301"],
			],
			expected: [
				"| Type   | Value |",
				"| ------ | ----- |",
				"| CJK    | 東京  |",
				"| Emoji  | 👩‍💻    |",
				"| Accent | e\u0301     |",
			].join("\n"),
		},
	])(
		"aligns $case by display width without changing its data",
		({ matrix, expected }) => {
			const document = documentFromMatrix(matrix, { headerRow: true });
			const source = markdownCodec.serialize(document);

			expect(source).toBe(expected);
			const parsed = markdownCodec.parse(source);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(documentToMatrix(parsed.document)).toEqual(matrix);
		},
	);

	it("serializes an oversized narrow table without an argument-limit failure", () => {
		const rowCount = 130_000;
		const document = documentFromMatrix(
			[["A"], ...Array.from({ length: rowCount }, () => ["x"])],
			{ headerRow: true },
		);

		const lines = markdownCodec.serialize(document).split("\n");

		expect(lines).toHaveLength(rowCount + 2);
		expect(lines.slice(0, 3)).toEqual(["| A   |", "| --- |", "| x   |"]);
		expect(lines.at(-1)).toBe("| x   |");
	});

	it("keeps alignment padding outside encoded boundary whitespace", () => {
		const document = documentFromMatrix([["Note"], ["  spaced  "], ["wide"]], {
			headerRow: true,
		});

		expect(markdownCodec.serialize(document)).toBe(
			[
				"| Note                       |",
				"| -------------------------- |",
				"| &#32;&#32;spaced&#32;&#32; |",
				"| wide                       |",
			].join("\n"),
		);
	});

	it.each(unicodeBoundaryWhitespace)(
		"round-trips U+%s at both cell boundaries",
		(_codePoint, whitespace) => {
			const original = [["Note"], [`${whitespace}value${whitespace}`]];
			const document = documentFromMatrix(original, { headerRow: true });
			const parsed = markdownCodec.parse(markdownCodec.serialize(document));

			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(documentToMatrix(parsed.document)).toEqual(original);
		},
	);

	it("decodes emitted entities once and keeps entity-like user text literal", () => {
		const original = [["Note"], ["&#32;"], ["&amp;"], ["  &  "]];
		const document = documentFromMatrix(original, { headerRow: true });
		const source = markdownCodec.serialize(document);

		expect(source).toContain("&amp;#32;");
		expect(source).toContain("&amp;amp;");
		const parsed = markdownCodec.parse(source);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(documentToMatrix(parsed.document)).toEqual(original);
	});

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

describe("markdown padding for empty cells", () => {
	// A source view draws a placeholder where a cell holds nothing, so the file
	// reserves the room for it and the column stays aligned around it. See
	// core/empty-value.ts.
	it("pads an empty cell to hold the empty-value placeholder", () => {
		const parsed = markdownCodec.parse(
			"| Name | City | Role |\n| --- | --- | --- |\n| Ingrid |  | Designer |",
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const lines = markdownCodec.serialize(parsed.document).split("\n");
		const cellsOf = (line: string) => line.split("|").slice(1, -1);
		const widths = lines.map((line) =>
			cellsOf(line).map((cell) => cell.length),
		);

		// Every row agrees on every column, which is the point of the padding.
		expect(widths[1]).toEqual(widths[0]);
		expect(widths[2]).toEqual(widths[0]);
		// The empty column is wide enough for the placeholder, where a column
		// sized by its values alone would have stopped at "City".
		const emptyColumn = cellsOf(lines[2] ?? "")[1] ?? "";
		expect(emptyColumn.trim()).toBe("");
		expect(emptyColumn.length).toBeGreaterThanOrEqual(
			EMPTY_VALUE_PLACEHOLDER.length,
		);
	});

	it("leaves a column with values sized by those values", () => {
		const parsed = markdownCodec.parse(
			"| Name |\n| --- |\n| A table header longer than the placeholder |",
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const [, , row] = markdownCodec.serialize(parsed.document).split("\n");
		expect(row).toBe("| A table header longer than the placeholder |");
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
