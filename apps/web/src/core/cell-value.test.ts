import { describe, expect, it } from "vitest";
import { cellText, cellTextAt, isBlankCell, readCell } from "@/core/cell-value";
import type { CellValue, Row } from "@/core/types";

describe("projecting a cell value to text", () => {
	it.each([
		["", ""],
		["Ingrid", "Ingrid"],
		[" padded ", " padded "],
		["multi\nline", "multi\nline"],
		["漢字 é 🧪", "漢字 é 🧪"],
		// A numeric-looking string stays exactly the string it is: the projection
		// never reformats, so nothing here is a chance to normalize "007".
		["007", "007"],
		[0, "0"],
		[35, "35"],
		[-12, "-12"],
		[1.5, "1.5"],
		[-0.25, "-0.25"],
		[true, "true"],
		[false, "false"],
		[null, ""],
	] as const)("projects %p as %p", (value: CellValue, expected: string) => {
		expect(cellText(value)).toBe(expected);
	});

	// The two are indistinguishable once projected and stay distinct as values.
	// That is the whole reason text is a projection rather than the value.
	it("projects null and the empty string alike without merging them", () => {
		expect(cellText(null)).toBe(cellText(""));
		expect(isBlankCell(null)).toBe(false);
		expect(isBlankCell("")).toBe(true);
	});

	it.each([0, false, null, " "] as const)(
		"does not count %p as blank",
		(value: CellValue) => {
			expect(isBlankCell(value)).toBe(false);
		},
	);
});

describe("reading a cell out of a row", () => {
	const row: Row = {
		id: "r1",
		cells: { present: null, text: "Ingrid", zero: 0 },
	};

	it("reads an absent key as an empty cell", () => {
		expect(readCell(row, "absent")).toBe("");
		expect(cellTextAt(row, "absent")).toBe("");
	});

	// The distinction `??` would have destroyed: a stored null is a value the
	// user or a typed source chose, not a cell nobody has filled in.
	it("keeps a stored null distinct from an absent key", () => {
		expect(readCell(row, "present")).toBeNull();
		expect(cellTextAt(row, "present")).toBe("");
	});

	it("returns other stored values unchanged", () => {
		expect(readCell(row, "text")).toBe("Ingrid");
		expect(readCell(row, "zero")).toBe(0);
		expect(cellTextAt(row, "zero")).toBe("0");
	});
});
