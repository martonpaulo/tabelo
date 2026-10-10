import { assert, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { jiraCodec } from "./jira";
import { escapeJiraCell, unescapeJiraCell } from "./jira-inline";

describe("jira cell escaping", () => {
	const hostile = [
		"plain",
		"",
		"has | pipe",
		"line one\nline two",
		"back\\slash",
		"already \\| escaped",
		"a || b",
		"everything | \n \\ at once",
	];

	it.each(hostile)("round-trips %j", (value) => {
		expect(unescapeJiraCell(escapeJiraCell(value))).toBe(value);
	});

	it("never emits a bare pipe that would split a row", () => {
		const escaped = escapeJiraCell("a | b");
		expect(escaped.replace(/\\\|/g, "")).not.toContain("|");
	});

	it.each([
		["newline then backslash", "\n\\", "\\\\&#92;"],
		["backslash then newline", "\\\n", "&#92;\\\\"],
		["newline then two backslashes", "\n\\\\", "\\\\&#92;&#92;"],
		["two literal backslashes", "\\\\", "&#92;&#92;"],
		["every token", "&\\|\n", "&amp;&#92;\\|\\\\"],
	])("emits an injective source for %s", (_case, value, expected) => {
		expect(escapeJiraCell(value)).toBe(expected);
		expect(unescapeJiraCell(expected)).toBe(value);
	});

	it("decodes entities once and keeps entity-like user text literal", () => {
		for (const value of ["&amp;", "&#92;", "&amp;#92;"]) {
			expect(unescapeJiraCell(escapeJiraCell(value))).toBe(value);
		}
	});
});

describe("jira parsing", () => {
	it("reads a table with a doubled-pipe header", () => {
		const result = jiraCodec.parse(
			[
				"||Name||Role||Active||",
				"|Ingrid|Designer|Yes|",
				"|Paulo|Developer|No|",
			].join("\n"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(documentToMatrix(result.document)).toEqual([
			["Name", "Role", "Active"],
			["Ingrid", "Designer", "Yes"],
			["Paulo", "Developer", "No"],
		]);
	});

	it("rejects text with no header row", () => {
		expect(jiraCodec.parse("|Ingrid|Designer|").ok).toBe(false);
	});

	it("reports a ragged row without discarding it", () => {
		const result = jiraCodec.parse("||A||B||\n|only-one|");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings?.length).toBeGreaterThan(0);
		expect(result.document.rows).toHaveLength(1);
	});
});

describe("jira serialization", () => {
	it.each([
		" leading",
		"trailing ",
		"  repeated  ",
		"\tvalue\t",
		"\u00a0value\u00a0",
		"   ",
	])("round-trips boundary whitespace in %j", (value) => {
		const original = [["Note"], [value]];
		const document = documentFromMatrix(original, { headerRow: true });
		const parsed = jiraCodec.parse(jiraCodec.serialize(document));

		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(documentToMatrix(parsed.document)).toEqual(original);
	});

	it("marks header cells with doubled pipes", () => {
		const document = documentFromMatrix(
			[
				["A", "B"],
				["1", "2"],
			],
			{ headerRow: true },
		);
		expect(jiraCodec.serialize(document)).toBe("||A||B||\n|1|2|");
	});

	it("survives a full round trip with hostile values", () => {
		const original = [
			["Name", "Note"],
			["Ingrid", "line one\nline two"],
			["Paulo", "a | b"],
		];
		const document = documentFromMatrix(original, { headerRow: true });

		const reparsed = jiraCodec.parse(jiraCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual(original);
	});
});

// #485: under the boolean spelling Jira writes its status icons, a plain
// string that would read as one is escaped, and only a parse that asks for
// the spelling reads an unescaped icon as a boolean.
describe("jira boolean spelling", () => {
	const document = documentFromMatrix(
		[
			["name", "remote", "note"],
			["Ingrid", true, "(/)"],
			["Paulo", false, "(x)"],
		],
		{ headerRow: true },
	);

	it("writes status icons only under the spelling", () => {
		const plain = jiraCodec.serialize(document);
		const icons = jiraCodec.serialize(document, { booleanMarks: true });

		expect(jiraCodec.serialize(document, { booleanMarks: false })).toBe(plain);
		expect(plain.split("\n").slice(1)).toEqual([
			"|Ingrid|true|(/)|",
			"|Paulo|false|(x)|",
		]);
		expect(icons.split("\n").slice(1)).toEqual([
			"|Ingrid|(/)|\\(/)|",
			"|Paulo|(x)|\\(x)|",
		]);
	});

	it("escapes a whole-cell icon and nothing else", () => {
		const text = jiraCodec.serialize(
			documentFromMatrix([["note"], ["(/) done"], ["see (x)"], ["(see)"]], {
				headerRow: true,
			}),
			{ booleanMarks: true },
		);
		expect(text.split("\n").slice(1)).toEqual([
			"|(/) done|",
			"|see (x)|",
			"|(see)|",
		]);
	});

	it("reads an unescaped icon as a boolean only when asked to", () => {
		const text = "||(/)||remote||note||\n|a|(/)|\\(/)|\n|b|(x)|\\(x)|";
		const spelled = jiraCodec.parse(text, { booleanMarks: true });
		const plain = jiraCodec.parse(text);
		assert(spelled.ok && plain.ok);

		expect(spelled.document.columns[0]?.header).toBe("(/)");
		expect(
			spelled.document.rows.map((row) =>
				spelled.document.columns.map((column) => row.cells[column.id]),
			),
		).toEqual([
			["a", true, "(/)"],
			["b", false, "(x)"],
		]);
		expect(documentToMatrix(plain.document)).toEqual([
			["(/)", "remote", "note"],
			["a", "(/)", "(/)"],
			["b", "(x)", "(x)"],
		]);
	});

	it("never reads a boolean from text it imports or pastes", () => {
		const parsed = jiraCodec.parseMatrix("||a||b||\n|(/)|(x)|");
		assert(parsed.ok);
		expect(parsed.table.matrix).toEqual([
			["a", "b"],
			["(/)", "(x)"],
		]);
	});

	it("reads text written before the spelling existed the same way", () => {
		// A line break before a parenthesis is the one place a backslash stood
		// before `(` in earlier output, and it is still a line break.
		const earlier = jiraCodec.serialize(
			documentFromMatrix([["note"], ["one\n(two)"], ["(/)"]], {
				headerRow: true,
			}),
		);
		expect(earlier).toBe("||note||\n|one\\\\(two)|\n|(/)|");
		const parsed = jiraCodec.parse(earlier);
		assert(parsed.ok);
		expect(documentToMatrix(parsed.document)).toEqual([
			["note"],
			["one\n(two)"],
			["(/)"],
		]);
	});
});
