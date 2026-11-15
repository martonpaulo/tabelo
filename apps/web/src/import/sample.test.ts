import { describe, expect, it } from "vitest";
import { samplePeopleMatrix } from "@/core/sample-data";
import { IMPORT_SAMPLE_LIMITS, importSample } from "./sample";

describe("importSample", () => {
	it("keeps a small table whole, row 1 first", () => {
		const matrix = [
			["Name", "City"],
			["Ingrid", "Rio"],
		];
		const sample = importSample(matrix);
		expect(sample.rows.map((row) => row.map((cell) => cell.text))).toEqual(
			matrix,
		);
		expect(sample.omittedRows).toBe(0);
		expect(sample.omittedColumns).toBe(0);
	});

	it("counts the rows and columns past the bounds without showing them", () => {
		const width = IMPORT_SAMPLE_LIMITS.columns + 2;
		const matrix = Array.from(
			{ length: IMPORT_SAMPLE_LIMITS.rows + 3 },
			(_, r) => Array.from({ length: width }, (_, c) => `${r}:${c}`),
		);
		const sample = importSample(matrix);
		expect(sample.rows).toHaveLength(IMPORT_SAMPLE_LIMITS.rows);
		expect(sample.rows[0]).toHaveLength(IMPORT_SAMPLE_LIMITS.columns);
		expect(sample.omittedRows).toBe(3);
		expect(sample.omittedColumns).toBe(2);
	});

	it("reads a ragged input by its widest row and pads the rest empty", () => {
		const sample = importSample([["a"], ["b", "c", "d"]]);
		expect(sample.rows[0]?.map((cell) => cell.text)).toEqual(["a", "", ""]);
		expect(sample.omittedColumns).toBe(0);
	});

	it("clips a long cell at the bound and says so", () => {
		const long = "x".repeat(IMPORT_SAMPLE_LIMITS.cellCharacters + 5);
		const [cell] = importSample([[long]]).rows[0] ?? [];
		expect(cell?.clipped).toBe(true);
		expect([...(cell?.text ?? "")]).toHaveLength(
			IMPORT_SAMPLE_LIMITS.cellCharacters + 1,
		);
	});

	it("keeps empty fields and line breaks as they are", () => {
		const [cells] = importSample([["", "Rio\nMadrid"]]).rows;
		expect(cells?.map((cell) => cell.text)).toEqual(["", "Rio\nMadrid"]);
		expect(cells?.some((cell) => cell.clipped)).toBe(false);
	});

	// A typed value shows its one projection; nothing reads a type off text.
	it("shows typed values through the cell projection", () => {
		const matrix = samplePeopleMatrix(1);
		const [header, first] = importSample(matrix).rows;
		expect(header?.map((cell) => cell.text)).toEqual(
			matrix[0]?.map((value) => String(value)),
		);
		expect(first?.map((cell) => cell.text)).toEqual(
			matrix[1]?.map((value) => String(value)),
		);
		expect(importSample([[true, null, 7]]).rows[0]?.map((c) => c.text)).toEqual(
			["true", "", "7"],
		);
	});

	it("shows nothing for an empty input", () => {
		expect(importSample([])).toEqual({
			rows: [],
			omittedRows: 0,
			omittedColumns: 0,
		});
	});
});
