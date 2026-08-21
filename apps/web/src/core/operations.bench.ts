import { bench, describe } from "vitest";
import {
	clearCells,
	deleteRows,
	fillRange,
	insertRows,
	moveColumns,
	pasteMatrix,
	setCell,
} from "@/core/operations";
import {
	BENCH_ROWS,
	benchDocument,
	benchOptions,
	benchPasteMatrix,
	consumeDocument,
} from "@/testing/bench-fixtures";

// The pure document operations, measured as the product issues them: one call
// per user action, not a batch. Some of these are fast enough to sit near the
// clock's own resolution, which is what the timer-floor bench below exists to
// show. A figure at or under the floor is noise, not a measurement, and
// docs/performance.md records the floor beside the baseline for that reason.

for (const rows of BENCH_ROWS) {
	const options = benchOptions(rows);

	describe(`operations, ${rows} rows`, () => {
		const document = benchDocument(rows, "plain");
		const middle = Math.floor(rows / 2);
		const pasted = benchPasteMatrix();

		bench(
			"setCell",
			() => {
				consumeDocument(setCell(document, middle, 1, "written"));
			},
			options,
		);

		bench(
			"insertRows",
			() => {
				consumeDocument(insertRows(document, middle));
			},
			options,
		);

		bench(
			"deleteRows",
			() => {
				consumeDocument(deleteRows(document, [middle]));
			},
			options,
		);

		bench(
			"moveColumns",
			() => {
				consumeDocument(moveColumns(document, { from: 0, count: 1 }, 2));
			},
			options,
		);

		// A drag that repeats one row across a hundred, which is the shape of the
		// fill the grid's handle produces.
		bench(
			"fillRange",
			() => {
				consumeDocument(
					fillRange(
						document,
						{ top: 0, left: 0, bottom: 0, right: 3 },
						{ top: 0, left: 0, bottom: 99, right: 3 },
					),
				);
			},
			options,
		);

		bench(
			"clearCells",
			() => {
				consumeDocument(
					clearCells(document, [{ top: 0, left: 0, bottom: 99, right: 3 }]),
				);
			},
			options,
		);

		bench(
			"pasteMatrix",
			() => {
				consumeDocument(
					pasteMatrix(document, { rowIndex: middle, columnIndex: 0 }, pasted),
				);
			},
			options,
		);
	});
}

// What an empty body costs. Tinybench times each call individually, so this is
// the resolution below which a figure above says nothing about the code it
// names. It is deliberately last, and it is the first number to read when an
// operation above looks impossibly cheap.
describe("timer floor", () => {
	bench(
		"empty body",
		() => {
			// Intentionally empty: the measurement is the loop and the clock.
		},
		benchOptions(200),
	);
});
