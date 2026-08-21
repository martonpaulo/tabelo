import { bench, describe } from "vitest";
import { listCodecs } from "@/formats";
import type { CodecId } from "@/formats/types";
import {
	BENCH_ROWS,
	type BenchShape,
	benchDocument,
	benchOptions,
	consumeDocument,
	consumeText,
} from "@/testing/bench-fixtures";

// Every codec's parse and serialize, driven from the registry rather than from
// a list written here. A new format is measured because it was registered, and
// nothing outside formats/index.ts enumerates formats. See docs/adr/0005.
//
// This file runs in the default `node` environment, unlike the HTML codec's
// unit tests, because the one path that needs a DOM is the one path excluded
// below.

// `htmlCodec.parse` goes through the platform's `DOMParser`, which in a test
// runner means happy-dom. Measured on 2026-08-22: happy-dom retains about 12 MB
// per parse of a 29 KB table and never releases it, so a fixed-iteration loop
// exhausts a 2 GB heap after roughly 150 calls and the run dies. That figure
// would be measuring happy-dom's allocation behaviour rather than the codec,
// and the product never runs happy-dom. Serialization is pure string building
// and is measured for every codec including this one.
//
// Recorded in docs/performance.md as a known gap rather than hidden here.
const PARSE_EXCLUDED: readonly CodecId[] = ["html"];

const shapes: readonly BenchShape[] = ["plain", "escapeHeavy"];

for (const rows of BENCH_ROWS) {
	for (const shape of shapes) {
		const options = benchOptions(rows);
		const document = benchDocument(rows, shape);

		describe(`serialize, ${rows} rows, ${shape}`, () => {
			for (const codec of listCodecs()) {
				bench(
					codec.id,
					() => {
						consumeText(codec.serialize(document));
					},
					options,
				);
			}
		});

		describe(`parse, ${rows} rows, ${shape}`, () => {
			for (const codec of listCodecs()) {
				if (PARSE_EXCLUDED.includes(codec.id)) continue;

				// Parsing this codec's own output is the only input every codec
				// agrees on, and it is what the product actually does: a source
				// pane parses text the same codec wrote.
				const text = codec.serialize(document);

				// A failing parse would still be timed, and the figure would be the
				// cost of producing an error rather than of reading a table. Refuse
				// at setup, where it costs one call and is impossible to miss,
				// rather than per iteration.
				const check = codec.parse(text);
				if (!check.ok) {
					throw new Error(
						`The ${codec.id} bench fixture does not parse back: ${check.issues
							.map((issue) => issue.code)
							.join(", ")}`,
					);
				}
				bench(
					codec.id,
					() => {
						const result = codec.parse(text);
						if (result.ok) consumeDocument(result.document);
					},
					options,
				);
			}
		});
	}
}
