import { describe, expect, it } from "vitest";
import { cellTextAt, readCell } from "./cell-value";
import { documentFromMatrix } from "./document";
import {
	type CellMatch,
	findMatches,
	matchIndexFrom,
	positionAfterReplacement,
	replaceMatches,
} from "./find";
import { samplePeopleMatrix } from "./sample-data";
import { HEADER_ROW } from "./selection";
import type { CellValue, TableDocument } from "./types";

function tableOf(matrix: readonly (readonly CellValue[])[]): TableDocument {
	return documentFromMatrix(matrix, { headerRow: true });
}

function people(rows?: number): TableDocument {
	return tableOf(samplePeopleMatrix(rows));
}

function coordinates(matches: readonly CellMatch[]): string[] {
	return matches.map(
		(match) => `${match.row}:${match.column}@${match.start}-${match.end}`,
	);
}

function textAt(document: TableDocument, row: number, column: number): string {
	const target = document.columns[column];
	if (!target) throw new Error(`No column at index ${column}`);
	if (row === HEADER_ROW) return target.header;
	const dataRow = document.rows[row];
	if (!dataRow) throw new Error(`No row at index ${row}`);
	return cellTextAt(dataRow, target.id);
}

describe("finding occurrences", () => {
	it("matches header cells and body cells in document order", () => {
		const document = tableOf([
			["name", "city"],
			["Ingrid", "Rio"],
			["Paulo", "Madrid"],
		]);

		const matches = findMatches(document, "i", false);

		// The header row comes first, then each data row left to right, and the
		// header is addressed by the same sentinel the selection uses. "Ingrid"
		// carries two of them, so one cell can hold several occurrences.
		expect(coordinates(matches)).toEqual([
			`${HEADER_ROW}:1@1-2`,
			"0:0@0-1",
			"0:0@4-5",
			"0:1@1-2",
			"1:1@4-5",
		]);
	});

	it("finds nothing for an empty query", () => {
		expect(findMatches(people(2), "", false)).toEqual([]);
		expect(findMatches(people(2), "", true)).toEqual([]);
	});

	it("takes non-overlapping occurrences left to right", () => {
		const document = tableOf([["text"], ["aaaa"]]);

		expect(coordinates(findMatches(document, "aa", true))).toEqual([
			"0:0@0-2",
			"0:0@2-4",
		]);
	});

	it("respects the case toggle in both directions", () => {
		const document = tableOf([["Role"], ["role"], ["ROLE"]]);

		expect(findMatches(document, "role", true)).toHaveLength(1);
		expect(findMatches(document, "role", false)).toHaveLength(3);
	});

	it("reports offsets into the cell's own text, not into a folded copy", () => {
		// Lowercasing this character produces two code units in JavaScript, so a
		// matcher that folded the whole string first would report an offset the
		// original value does not have.
		const document = tableOf([["header"], ["İstanbul road"]]);

		const [match] = findMatches(document, "road", false);

		expect(match).toBeDefined();
		expect(textAt(document, 0, 0).slice(match?.start, match?.end)).toBe("road");
	});

	it("treats cell values as opaque strings", () => {
		// Characters that other formats escape are matched exactly as the cell
		// holds them: nothing is unescaped or normalized on the way here.
		const document = tableOf([["a | b"], ["one\ntwo"], ["back\\slash"]]);

		expect(findMatches(document, "|", true)).toHaveLength(1);
		expect(findMatches(document, "\n", true)).toHaveLength(1);
		expect(findMatches(document, "\\", true)).toHaveLength(1);
		expect(findMatches(document, "<br>", true)).toHaveLength(0);
	});

	it("matches a native value through its text projection", () => {
		const document = people();

		// The roster declares its ages as numbers, and the projection is what the
		// user sees and searches. Nothing here reads a type off the text.
		expect(findMatches(document, "35", true)).toHaveLength(2);
	});
});

describe("replacing occurrences", () => {
	it("rewrites only the matched characters", () => {
		const document = tableOf([["header"], ["a-b-c"]]);
		const matches = findMatches(document, "-", true);

		const next = replaceMatches(document, matches, "+");

		expect(textAt(next, 0, 0)).toBe("a+b+c");
	});

	it("keeps every earlier occurrence addressable when the length changes", () => {
		const document = tableOf([["header"], ["xxx"]]);
		const matches = findMatches(document, "x", true);

		expect(textAt(replaceMatches(document, matches, "yy"), 0, 0)).toBe(
			"yyyyyy",
		);
		expect(textAt(replaceMatches(document, matches, ""), 0, 0)).toBe("");
	});

	it("replaces inside a header cell", () => {
		const document = tableOf([["city"], ["Rio"]]);
		const matches = findMatches(document, "city", true);

		expect(replaceMatches(document, matches, "town").columns[0]?.header).toBe(
			"town",
		);
	});

	it("writes a replaced native value back as a string", () => {
		const document = people(1);
		const ageColumn = document.columns.length - 1;
		const matches = findMatches(document, "35", true).filter(
			(match) => match.row === 0 && match.column === ageColumn,
		);

		const next = replaceMatches(document, matches, "36");
		const row = next.rows[0];
		const column = next.columns[ageColumn];

		expect(row && column && readCell(row, column.id)).toBe("36");
	});

	it("leaves a cell untouched when the replacement changes nothing", () => {
		const document = people(1);
		const matches = findMatches(document, "35", true);

		// Replacing a value with itself is not an instruction to turn a number
		// into the string that looks like it.
		expect(replaceMatches(document, matches, "35")).toBe(document);
	});

	it("writes nothing when a range does not fit the value it names", () => {
		const document = tableOf([["header"], ["short"]]);
		const stale: CellMatch[] = [{ row: 0, column: 0, start: 0, end: 99 }];

		expect(replaceMatches(document, stale, "x")).toBe(document);
	});

	it("resumes past what it wrote so a self-containing replacement terminates", () => {
		const document = tableOf([["count"], ["aa"]]);
		const first = findMatches(document, "a", true)[0];
		if (!first) throw new Error("Expected an occurrence to replace.");

		const next = replaceMatches(document, [first], "aa");
		const resumed = matchIndexFrom(
			findMatches(next, "a", true),
			positionAfterReplacement(first, "aa"),
		);

		// Three occurrences now: the two just written and the original second
		// one. Resuming lands on the third, past the replacement.
		expect(findMatches(next, "a", true)).toHaveLength(3);
		expect(resumed).toBe(2);
	});

	it("wraps to the first occurrence when nothing follows the position", () => {
		const document = tableOf([["count"], ["a"]]);
		const matches = findMatches(document, "a", true);

		expect(matchIndexFrom(matches, { row: 9, column: 9, offset: 0 })).toBe(0);
		expect(matchIndexFrom([], { row: 0, column: 0, offset: 0 })).toBe(-1);
	});
});
