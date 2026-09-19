import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { jiraCodec } from "./jira";

// Jira reads two adjacent pipes as a header delimiter, so an empty cell is
// written with the one space Jira renders as an empty cell (JRASERVER-70048),
// and a value of exactly one space is written as its character reference.
describe("jira empty cells", () => {
	const emptyTable = documentFromMatrix(
		[
			["", "", ""],
			["", "", ""],
			["", "", ""],
		],
		{ headerRow: true },
	);

	it("never writes two adjacent pipes in a body row", () => {
		const lines = jiraCodec.serialize(emptyTable).split("\n");
		for (const line of lines.slice(1)) {
			expect(line).not.toMatch(/(^|[^\\])\|\|/);
		}
	});

	it("reads every empty cell of an empty table back as its own cell", () => {
		const parsed = jiraCodec.parseMatrix(jiraCodec.serialize(emptyTable));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.warnings).toBeUndefined();
		expect(parsed.table.matrix).toEqual(documentToMatrix(emptyTable));
		// One mapped cell per column on every line, header included (#255).
		const rows = parsed.rows ?? [];
		expect(rows).toHaveLength(3);
		for (const row of rows) expect(row.cells).toHaveLength(3);
	});

	it.each([
		["empty", ""],
		["one space", " "],
		["two spaces", "  "],
		["a tab", "\t"],
		["a pipe", "|"],
		["a spaced pipe", " | "],
		["the reference text", "&#32;"],
	])(
		"round-trips %s in the header and a body row byte-exact",
		(_case, value) => {
			const original = [
				[value, "B"],
				[value, "x"],
				["x", value],
			];
			const document = documentFromMatrix(original, { headerRow: true });
			const text = jiraCodec.serialize(document);
			const parsed = jiraCodec.parse(text);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(documentToMatrix(parsed.document)).toEqual(original);
			expect(jiraCodec.serialize(parsed.document)).toBe(text);
		},
	);

	it("still reads a hand-typed `||` inside a body row as an empty cell", () => {
		const parsed = jiraCodec.parseMatrix("||a||b||c||\n|x||z|");
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.table.matrix[1]).toEqual(["x", "", "z"]);
	});
});

describe("jira empty-cell fill assistance", () => {
	// Inserts `typed` at `at` and applies whatever the assistance returns.
	function type(before: string, at: number, typed: string): string {
		const assist = jiraCodec.structuralAssistance;
		if (!assist) throw new Error("Jira declares no structural assistance.");
		const after = `${before.slice(0, at)}${typed}${before.slice(at)}`;
		const edits = assist(before, after, [{ from: at, to: at + typed.length }]);
		// Written against `after` in document order, so applied from the end.
		return [...(edits ?? [])]
			.reverse()
			.reduce(
				(text, edit) =>
					text.slice(0, edit.from) + edit.insert + text.slice(edit.to),
				after,
			);
	}

	const table = "||a||b||\n| | |";

	it("replaces the space when typing before it", () => {
		expect(type(table, 10, "Rio")).toBe("||a||b||\n|Rio| |");
	});

	it("replaces the space when typing after it", () => {
		expect(type(table, 13, "Rio")).toBe("||a||b||\n| |Rio|");
	});

	it("fills an empty header cell", () => {
		expect(type("|| ||b||\n|x|y|", 2, "a")).toBe("||a||b||\n|x|y|");
	});

	it("leaves a typed space, a line break, and a filled cell as typed", () => {
		expect(type(table, 10, " ")).toBe("||a||b||\n|  | |");
		expect(type(table, 10, "a\nb")).toBe("||a||b||\n|a\nb | |");
		expect(type("||a||\n|x|", 7, "y")).toBe("||a||\n|yx|");
	});
});
