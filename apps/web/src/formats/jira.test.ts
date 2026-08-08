import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { escapeJiraCell, jiraCodec, unescapeJiraCell } from "./jira";

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
