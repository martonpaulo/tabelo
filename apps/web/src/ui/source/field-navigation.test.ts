import { describe, expect, it } from "vitest";
import { adjacentFieldStart } from "./field-navigation";

// Three fields on "Name,City\nIngrid": Name [0, 4], City [5, 9], Ingrid [10, 16].
const fields = [
	{ from: 0, to: 4 },
	{ from: 5, to: 9 },
	{ from: 10, to: 16 },
];

describe("adjacent field", () => {
	it("moves forward from anywhere inside a field, or on the delimiter after it", () => {
		expect(adjacentFieldStart(fields, 0, 1)).toBe(5);
		expect(adjacentFieldStart(fields, 2, 1)).toBe(5);
		expect(adjacentFieldStart(fields, 4, 1)).toBe(5);
		expect(adjacentFieldStart(fields, 9, 1)).toBe(10);
	});

	it("moves backward to the previous field, not the start of the current one", () => {
		expect(adjacentFieldStart(fields, 7, -1)).toBe(0);
		expect(adjacentFieldStart(fields, 16, -1)).toBe(5);
	});

	it("wraps past the last field to the first, and before the first to the last", () => {
		expect(adjacentFieldStart(fields, 12, 1)).toBe(0);
		expect(adjacentFieldStart(fields, 0, -1)).toBe(10);
	});

	it("reaches the first field from a caret that sits before every field", () => {
		const padded = [
			{ from: 2, to: 6 },
			{ from: 9, to: 12 },
		];
		expect(adjacentFieldStart(padded, 0, 1)).toBe(2);
		expect(adjacentFieldStart(padded, 0, -1)).toBe(9);
	});

	it("has nowhere to go in text without fields", () => {
		expect(adjacentFieldStart([], 0, 1)).toBeNull();
		expect(adjacentFieldStart([], 0, -1)).toBeNull();
	});
});
