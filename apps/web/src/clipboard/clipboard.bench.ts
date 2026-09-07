import { bench, describe } from "vitest";
import {
	BENCH_ROWS,
	type BenchShape,
	benchOptions,
	benchSelection,
	consumeText,
} from "@/testing/bench-fixtures";
import { readTabeloPayload } from "./payload";
import { selectionClipboardPayload } from "./serialize";

// Copy and paste as the grid runs them. `copy` is the whole write path: the
// TSV, the HTML table, and the private payload spliced into it. `paste` is the
// transport half of the read path: the strip every reader of the HTML flavour
// runs, and the decode that turns the payload back into a selection.
//
// The public HTML parse is deliberately not here. It goes through `DOMParser`,
// which in a test runner means happy-dom, whose per-parse retention is what
// excludes HTML parse from the codec benches too. Including it would measure
// happy-dom rather than Tabelo. See docs/performance.md.
//
// This file runs in the default `node` environment, like every other bench.

const shapes: readonly BenchShape[] = ["plain", "escapeHeavy"];

for (const rows of BENCH_ROWS) {
	for (const shape of shapes) {
		const options = benchOptions(rows);
		const selection = benchSelection(rows, shape);
		const written = selectionClipboardPayload(selection);

		describe(`clipboard, ${rows} rows, ${shape}`, () => {
			bench(
				"copy",
				() => {
					const payload = selectionClipboardPayload(selection);
					consumeText(payload.text);
					consumeText(payload.html);
				},
				options,
			);

			bench(
				"paste",
				() => {
					const split = readTabeloPayload(written.html);
					consumeText(split.html);
					// The decode is the work, and its result is a selection rather
					// than a string, so its size is what keeps the call alive.
					consumeText(String(split.selection?.matrix.length ?? 0));
				},
				options,
			);
		});
	}
}
