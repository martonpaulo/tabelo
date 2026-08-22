import type { BenchOptions } from "vitest";
import { cellText } from "@/core/cell-value";
import { documentFromMatrix } from "@/core/document";
import { samplePeople, samplePeopleHeaders } from "@/core/sample-data";
import type { CellValue, TableDocument } from "@/core/types";

// The tables `pnpm bench` measures. Fixed, deterministic, and built from the
// shared roster, so two runs on one machine measure the same bytes and a figure
// can be compared with the one recorded in docs/performance.md rather than only
// with itself.
//
// Nothing here is random. A benchmark whose input varies between runs measures
// the input as much as the code, and the baseline it produces cannot catch a
// regression smaller than its own spread.

// The documented target scale, and one step past it. Two sizes, because the
// second exists to expose growth that is not linear, not to invite work on
// large documents: AGENTS.md puts the target at roughly 200 rows.
export const BENCH_ROWS = [200, 1000] as const;

export type BenchRowCount = (typeof BENCH_ROWS)[number];

// A fixed number of timed calls after a fixed warm-up, which is the whole
// reason these options exist. Tinybench's task loop runs
// `while (totalTime < time || samples.length < iterations)`, so `time: 0` makes
// `iterations` exact. Vitest's defaults are `time: 500` with `iterations: 10`,
// a clock-driven loop whose sample count depends on how fast the machine is,
// and clock-driven loops of that shape read high under allocation pressure.
// https://vitest.dev/api/#bench
const ITERATIONS: Record<BenchRowCount, number> = { 200: 200, 1000: 50 };

// Twenty warm-up calls at every size, not a fraction of the iteration count. A
// five-call warm-up left the first 1000-row bench in a process measurably
// slower than the identical one after it, which is V8 still tiering up rather
// than anything about the code. Twenty is where that difference disappeared.
const WARMUP_ITERATIONS = 20;

// One owner for how every bench in this workspace is timed. A bench that sets
// its own counts is a figure that cannot be compared with the ones beside it.
export function benchOptions(rows: BenchRowCount): BenchOptions {
	return {
		time: 0,
		iterations: ITERATIONS[rows],
		warmupTime: 0,
		warmupIterations: WARMUP_ITERATIONS,
	};
}

// What a cell holds decides which paths run, and the difference is large enough
// that one shape would hide the other. `plain` is the roster as it stands.
// `escapeHeavy` carries the characters Markdown and Jira have to escape. It is
// the kind of cell the 2026-08-20 study measured at 1.837 ms against a fraction
// of that for plain text, and the path #263 and #264 exist to make cheaper.
// Figures for these fixtures are in docs/performance.md; the study's are not
// comparable with them, being a different table on a different machine.
export type BenchShape = "plain" | "escapeHeavy";

// One extra column beside the roster's four, holding the escape-triggering
// characters. Kept as its own column rather than mixed into the names so the
// plain and escape-heavy tables stay the same shape and their figures stay
// comparable.
const NOTE_HEADER = "note";

const PLAIN_NOTE = "no escaping needed here";

// A pipe, an embedded newline, a backslash, and a literal ampersand: every
// character Markdown or Jira has to encode, plus a `<br>` the Markdown
// serializer must protect so it survives as text.
const ESCAPED_NOTE = "a | b\nsecond line \\ third & <br> fourth";

function noteFor(shape: BenchShape): string {
	return shape === "plain" ? PLAIN_NOTE : ESCAPED_NOTE;
}

// The roster cycled to the requested length. `age` stays a real number because
// the roster declares that type; nothing here reads a type off the text, and a
// fixture that implied one would contradict docs/adr/0008.
function benchMatrix(rows: number, shape: BenchShape): CellValue[][] {
	const note = noteFor(shape);
	const body = Array.from({ length: rows }, (_, index) => {
		const person = samplePeople[index % samplePeople.length];
		if (!person) throw new Error("The sample roster is empty.");
		return [person.name, person.city, person.role, person.age, note];
	});
	return [[...samplePeopleHeaders, NOTE_HEADER], ...body];
}

// The cell strings a table of the given shape contains, in the order a
// serializer would meet them, projected through the same core function every
// codec reads a cell with. The codec benches measure a whole table; this is for
// a bench that has to isolate one function inside it, and it comes from here so
// the two are measuring the same bytes.
export function benchCells(rows: BenchRowCount, shape: BenchShape): string[] {
	return benchMatrix(rows, shape).flat().map(cellText);
}

export function benchDocument(
	rows: BenchRowCount,
	shape: BenchShape,
): TableDocument {
	return documentFromMatrix(benchMatrix(rows, shape), { headerRow: true });
}

// A rectangle of data cells to paste, sized so the write is a realistic block
// rather than one cell or the whole table.
export function benchPasteMatrix(): CellValue[][] {
	return Array.from({ length: 10 }, (_, index) => {
		const person = samplePeople[index % samplePeople.length];
		if (!person) throw new Error("The sample roster is empty.");
		return [person.name, person.city];
	});
}

// Every bench body feeds its result through one of these so V8 cannot discard
// the call it is supposed to be measuring. A pure function whose result nothing
// reads is dead code, and the loop around it would then be the only thing
// timed.
//
// The barrier is the call itself: these live in another module, so the caller
// cannot see that the argument is only added to a counter. The accumulator is
// what makes the argument genuinely read rather than merely passed.
//
// Deliberately write-only, hence the underscore: a reader would be one more
// thing to keep honest for a value that is meaningless by design, and both Knip
// and Biome are right to ask about an accumulator nobody consumes.
let _sink = 0;

export function consumeText(value: string): void {
	_sink += value.length;
}

export function consumeDocument(document: TableDocument): void {
	_sink += document.rows.length + document.columns.length;
}
