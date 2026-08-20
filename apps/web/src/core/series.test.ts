import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { setColumnExpectedType } from "@/core/operations";
import type { CellRect } from "@/core/selection";
import {
	applyFillSeries,
	captureFillSeriesOffer,
	planFillSeries,
	planOfferedSeries,
} from "@/core/series";
import type {
	CellValue,
	ExpectedColumnType,
	TableDocument,
} from "@/core/types";

// A table whose data rows carry the given values and whose columns expect the
// given types. Expected types are set explicitly because a series writes
// numbers and #201 owns what a column accepts.
function tableOf(
	rows: readonly (readonly CellValue[])[],
	expected: readonly ExpectedColumnType[],
): TableDocument {
	const headers = expected.map((_, index) => `C${index + 1}`);
	const document = documentFromMatrix([headers, ...rows], { headerRow: true });
	return expected.reduce(
		(carried, type, index) => setColumnExpectedType(carried, index, type),
		document,
	);
}

function column(top: number, bottom: number, at: number): CellRect {
	return { top, bottom, left: at, right: at };
}

function row(left: number, right: number, at: number): CellRect {
	return { top: at, bottom: at, left, right };
}

function seriesValues(
	document: TableDocument,
	source: CellRect,
	target: CellRect,
): readonly CellValue[] {
	const eligibility = planFillSeries(document, source, target);
	if (!eligibility.ok) throw new Error(`refused: ${eligibility.refusal}`);
	const next = applyFillSeries(document, eligibility.plan);
	return next.rows.map((candidate) => {
		const first = next.columns[source.left];
		return first ? (candidate.cells[first.id] ?? "") : "";
	});
}

function refusalOf(
	document: TableDocument,
	source: CellRect,
	target: CellRect,
): string | null {
	const eligibility = planFillSeries(document, source, target);
	return eligibility.ok ? null : eligibility.refusal;
}

describe("numeric series eligibility", () => {
	it("continues a copied pair instead of repeating it", () => {
		const document = tableOf([[1], [2], [1], [2]], ["number"]);

		expect(seriesValues(document, column(0, 1, 0), column(0, 3, 0))).toEqual([
			1, 2, 3, 4,
		]);
	});

	it("runs backwards when the fill extended upwards", () => {
		const document = tableOf([[3], [4], [3], [4]], ["number"]);
		// The copy fill tiled upwards from a source that now sits at the bottom.
		const source = column(2, 3, 0);
		const target = column(0, 3, 0);

		expect(seriesValues(document, source, target)).toEqual([1, 2, 3, 4]);
	});

	it("continues along a row as readily as down a column", () => {
		const document = tableOf(
			[[10, 20, 10, 20]],
			["number", "number", "number", "number"],
		);
		const eligibility = planFillSeries(document, row(0, 1, 0), row(0, 3, 0));
		if (!eligibility.ok) throw new Error(eligibility.refusal);

		expect(
			documentToMatrix(applyFillSeries(document, eligibility.plan)),
		).toEqual([
			["C1", "C2", "C3", "C4"],
			["10", "20", "30", "40"],
		]);
	});

	it.each([
		["negative", [5, 3], [5, 3, 1, -1]],
		["zero", [7, 7], [7, 7, 7, 7]],
		["fractional", [1, 1.1], [1, 1.1, 1.2, 1.3]],
	])("carries a %s difference", (_label, source, expected) => {
		const document = tableOf(
			[...source, ...source].map((value) => [value]),
			["number"],
		);

		expect(seriesValues(document, column(0, 1, 0), column(0, 3, 0))).toEqual(
			expected,
		);
	});

	it("keeps decimal steps exact rather than drifting into float noise", () => {
		const document = tableOf([[0.1], [0.2], [0.1], [0.2]], ["number"]);

		expect(seriesValues(document, column(0, 1, 0), column(0, 3, 0))).toEqual([
			0.1, 0.2, 0.3, 0.4,
		]);
	});

	it("reads a three-value source and rejects one whose steps disagree", () => {
		const constant = tableOf([[2], [4], [6], [2]], ["number"]);
		expect(seriesValues(constant, column(0, 2, 0), column(0, 3, 0))).toEqual([
			2, 4, 6, 8,
		]);

		const uneven = tableOf([[2], [4], [7], [2]], ["number"]);
		expect(refusalOf(uneven, column(0, 2, 0), column(0, 3, 0))).toBe(
			"not-constant",
		);
	});

	it("never reads a number out of numeric-looking text", () => {
		const document = tableOf([["1"], ["2"], ["1"], ["2"]], ["number"]);

		expect(refusalOf(document, column(0, 1, 0), column(0, 3, 0))).toBe(
			"not-numeric",
		);
	});

	it("refuses a single source value rather than inventing a step", () => {
		const document = tableOf([[1], [1], [1]], ["number"]);

		expect(refusalOf(document, column(0, 0, 0), column(0, 2, 0))).toBe(
			"too-few-values",
		);
	});

	it("refuses a source or extension that is not one-dimensional", () => {
		const document = tableOf(
			[
				[1, 2],
				[3, 4],
				[1, 2],
				[3, 4],
			],
			["number", "number"],
		);

		expect(
			refusalOf(
				document,
				{ top: 0, bottom: 1, left: 0, right: 1 },
				{ top: 0, bottom: 3, left: 0, right: 1 },
			),
		).toBe("not-one-dimensional");
		// A column of two values tiled sideways is a second dimension too.
		expect(
			refusalOf(document, column(0, 1, 0), {
				top: 0,
				bottom: 1,
				left: 0,
				right: 1,
			}),
		).toBe("not-one-dimensional");
	});

	it("refuses a target column whose expectation contradicts a number", () => {
		const document = tableOf([[10, 20, 10]], ["number", "number", "boolean"]);

		expect(refusalOf(document, row(0, 1, 0), row(0, 2, 0))).toBe(
			"expected-type",
		);
	});

	it("continues into a text column, which constrains nothing", () => {
		const document = tableOf([[10, 20, 10]], ["number", "number", "text"]);
		const eligibility = planFillSeries(document, row(0, 1, 0), row(0, 2, 0));
		if (!eligibility.ok) throw new Error(eligibility.refusal);

		expect(eligibility.plan.writes.map((write) => write.value)).toEqual([30]);
	});

	it("continues values too large for a decimal scale", () => {
		const document = tableOf([[1e21], [2e21], [1e21], [2e21]], ["number"]);

		expect(seriesValues(document, column(0, 1, 0), column(0, 3, 0))).toEqual([
			1e21, 2e21, 3e21, 4e21,
		]);
	});

	it("refuses a series that would overflow to infinity", () => {
		const document = tableOf(
			[[1e308], [1.5e308], [1e308], [1.5e308]],
			["number"],
		);

		expect(refusalOf(document, column(0, 1, 0), column(0, 3, 0))).toBe(
			"not-representable",
		);
	});

	it("refuses a step that leaves the range the arithmetic stays exact in", () => {
		const document = tableOf(
			[[1], [9_000_000_000_000_000], [1], [1]],
			["number"],
		);

		expect(refusalOf(document, column(0, 1, 0), column(0, 3, 0))).toBe(
			"not-representable",
		);
	});

	it("refuses a target that adds nothing", () => {
		const document = tableOf([[1], [2]], ["number"]);

		expect(refusalOf(document, column(0, 1, 0), column(0, 1, 0))).toBe(
			"nothing-to-extend",
		);
	});
});

describe("offer revalidation", () => {
	it("resolves the same cells the fill named", () => {
		const document = tableOf([[1], [2], [1], [2]], ["number"]);
		const offer = captureFillSeriesOffer(
			document,
			column(0, 1, 0),
			column(0, 3, 0),
		);
		const eligibility = planOfferedSeries(document, offer);
		if (!eligibility.ok) throw new Error(eligibility.refusal);

		expect(
			applyFillSeries(document, eligibility.plan).rows.map((candidate) => {
				const first = document.columns[0];
				return first ? candidate.cells[first.id] : null;
			}),
		).toEqual([1, 2, 3, 4]);
	});

	it("refuses once the rows it named have moved", () => {
		const document = tableOf([[1], [2], [1], [2]], ["number"]);
		const offer = captureFillSeriesOffer(
			document,
			column(0, 1, 0),
			column(0, 3, 0),
		);
		const reordered: TableDocument = {
			...document,
			rows: [...document.rows.slice(1), ...document.rows.slice(0, 1)],
		};

		expect(planOfferedSeries(reordered, offer)).toEqual({
			ok: false,
			refusal: "stale",
		});
	});

	it("refuses once a row it named has gone", () => {
		const document = tableOf([[1], [2], [1], [2]], ["number"]);
		const offer = captureFillSeriesOffer(
			document,
			column(0, 1, 0),
			column(0, 3, 0),
		);
		const shortened: TableDocument = {
			...document,
			rows: document.rows.slice(0, 2),
		};

		expect(planOfferedSeries(shortened, offer)).toEqual({
			ok: false,
			refusal: "stale",
		});
	});
});

describe("applying a series", () => {
	it("leaves the source cells exactly as they were", () => {
		const document = tableOf([[1], [2], [1], [2]], ["number"]);
		const eligibility = planFillSeries(
			document,
			column(0, 1, 0),
			column(0, 3, 0),
		);
		if (!eligibility.ok) throw new Error(eligibility.refusal);
		const next = applyFillSeries(document, eligibility.plan);

		expect(next.rows[0]).toBe(document.rows[0]);
		expect(next.rows[1]).toBe(document.rows[1]);
	});

	it("writes nothing at all when one of its rows is missing", () => {
		const document = tableOf([[1], [2], [1], [2]], ["number"]);
		const eligibility = planFillSeries(
			document,
			column(0, 1, 0),
			column(0, 3, 0),
		);
		if (!eligibility.ok) throw new Error(eligibility.refusal);
		const shortened: TableDocument = {
			...document,
			rows: document.rows.slice(0, 3),
		};

		expect(applyFillSeries(shortened, eligibility.plan)).toBe(shortened);
	});
});
