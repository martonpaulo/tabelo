import { bench, describe } from "vitest";
import { escapeAndMeasure, escapeCell, unescapeCell } from "@/formats/markdown";
import {
	benchCells,
	benchOptions,
	consumeText,
} from "@/testing/bench-fixtures";

// Markdown's escaping, measured on its own. `codecs.bench.ts` times the whole
// codec, which is the figure that matters to a user, but it cannot say how much
// of a parse is spent decoding cells. #263 was opened without that number and
// closed with it.
//
// One call covers every cell of a table rather than a single cell: one cell is
// close enough to the timer floor documented in docs/performance.md that the
// figure would be reading the clock rather than the code.

const ROWS = 200;

for (const shape of ["plain", "escapeHeavy"] as const) {
	const cells = benchCells(ROWS, shape);
	const escaped = cells.map(escapeCell);
	const options = benchOptions(ROWS);

	describe(`markdown cells, ${ROWS} rows, ${shape}`, () => {
		bench(
			"escapeCell",
			() => {
				for (const cell of cells) consumeText(escapeCell(cell));
			},
			options,
		);

		// What the serializer actually calls. It is `escapeCell` plus a display
		// width, and it is where the fast path for cells needing no escaping
		// lives, so the gap between this and `escapeCell` is that path.
		bench(
			"escapeAndMeasure",
			() => {
				for (const cell of cells) consumeText(escapeAndMeasure(cell).text);
			},
			options,
		);

		bench(
			"unescapeCell",
			() => {
				for (const cell of escaped) consumeText(unescapeCell(cell));
			},
			options,
		);
	});
}
