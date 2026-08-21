import { bench, describe } from "vitest";
import {
	documentFromMatrix,
	documentToMatrix,
	reconcileDocument,
} from "@/core/document";
import { setCell } from "@/core/operations";
import {
	BENCH_ROWS,
	benchDocument,
	benchOptions,
	consumeDocument,
	consumeText,
} from "@/testing/bench-fixtures";

// Reconciliation and the two matrix conversions: the path a source-pane
// keystroke runs after every debounced commit. #59 measured `reconcileDocument`
// at 0.040 ms in its no-op case and disproved the suspicion that its second
// pass was expensive; these benches are what make that answer re-runnable
// instead of a sentence in a closed issue.

for (const rows of BENCH_ROWS) {
	const options = benchOptions(rows);

	describe(`document, ${rows} rows`, () => {
		const document = benchDocument(rows, "plain");
		const matrix = documentToMatrix(document);

		bench(
			"documentFromMatrix",
			() => {
				consumeDocument(documentFromMatrix(matrix, { headerRow: true }));
			},
			options,
		);

		bench(
			"documentToMatrix",
			() => {
				consumeText(documentToMatrix(document).join(""));
			},
			options,
		);

		// The case that matters most: the parse produced an identical shape, so
		// every row and column should come back as the very same object and the
		// grid's memoised rows should all skip. It is also the case that runs on
		// a keystroke that changed one cell somewhere else.
		const parsedIdentical = documentFromMatrix(matrix, { headerRow: true });
		bench(
			"reconcileDocument, unchanged",
			() => {
				consumeDocument(reconcileDocument(document, parsedIdentical));
			},
			options,
		);

		// One cell differs, which is what a real keystroke produces. The rest of
		// the document must still come back identical.
		const changed = setCell(parsedIdentical, 0, 0, "changed");
		bench(
			"reconcileDocument, one cell changed",
			() => {
				consumeDocument(reconcileDocument(document, changed));
			},
			options,
		);

		// A column added or removed is the shape change that defeats the
		// per-item early returns, so it is the upper bound of the three.
		const widened = documentFromMatrix(
			matrix.map((row) => [...row, "extra"]),
			{ headerRow: true },
		);
		bench(
			"reconcileDocument, column added",
			() => {
				consumeDocument(reconcileDocument(document, widened));
			},
			options,
		);
	});
}
