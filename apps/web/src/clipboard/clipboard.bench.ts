import { bench, describe } from "vitest";
import {
	BENCH_ROWS,
	type BenchShape,
	benchOptions,
	benchSelection,
	consumeText,
} from "@/testing/bench-fixtures";
import { decodeTabeloPayload, stripTabeloPayload } from "./payload";
import { selectionClipboardPayload } from "./serialize";

// The two halves of the clipboard transport, measured because #266 moved the
// private payload out of the HTML flavour and into one of its own.
//
// `copy` is the whole write path a grid copy runs: the TSV, the HTML table, and
// the private payload. `paste` is the transport-specific half of the read path:
// the strip every reader of the HTML flavour runs, and the decode that turns
// the private bytes back into a selection.
//
// The public HTML parse is deliberately not here. It is unchanged by the
// transport, it goes through `DOMParser`, and in a test runner that means
// happy-dom, whose per-parse retention is what excludes HTML parse from the
// codec benches too. Including it would measure happy-dom rather than Tabelo.
// See docs/performance.md.
//
// This file runs in the default `node` environment, like every other bench.

const shapes: readonly BenchShape[] = ["plain", "escapeHeavy"];

for (const rows of BENCH_ROWS) {
	for (const shape of shapes) {
		const options = benchOptions(rows);
		const selection = benchSelection(rows, shape);
		const written = selectionClipboardPayload(selection);
		const typed = written.typed ?? "";

		describe(`clipboard, ${rows} rows, ${shape}`, () => {
			bench(
				"copy",
				() => {
					const payload = selectionClipboardPayload(selection);
					consumeText(payload.text);
					consumeText(payload.html);
					consumeText(payload.typed ?? "");
				},
				options,
			);

			bench(
				"paste",
				() => {
					consumeText(stripTabeloPayload(written.html));
					// The decode is the work; the result is a selection rather than a
					// string, so its own size is what keeps the call alive.
					const selection = decodeTabeloPayload(typed);
					consumeText(String(selection?.matrix.length ?? 0));
				},
				options,
			);
		});
	}
}
