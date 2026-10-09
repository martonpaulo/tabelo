import { describe, expect, it } from "vitest";
import { cellValuesEqual, readCell } from "@/core/cell-value";
import { documentFromMatrix } from "@/core/document";
import { normalizeInline } from "@/core/inline-content";
import type {
	InlineMark,
	InlineNode,
	InlineText,
	TextContent,
} from "@/core/types";
import { jiraCodec } from "./jira";
import { parseJiraCell, writeJiraCell } from "./jira-inline";

const run = (text: string, ...marks: InlineMark[]): InlineText => ({
	kind: "text",
	text,
	marks,
});

function content(...nodes: InlineNode[]): TextContent {
	return normalizeInline(nodes);
}

function expectRoundTrip(value: TextContent) {
	const written = writeJiraCell(value);
	expect(cellValuesEqual(parseJiraCell(written), value), written).toBe(true);
	return written;
}

describe("Jira inline syntax", () => {
	it.each([
		["bold", content(run("Ingrid", "bold")), "*Ingrid*"],
		["italic", content(run("Rio", "italic")), "_Rio_"],
		["underline", content(run("Paulo", "underline")), "+Paulo+"],
		["strikethrough", content(run("Madrid", "strikethrough")), "-Madrid-"],
		["inline code", content(run("age", "code")), "{{age}}"],
		[
			"a link",
			content({
				kind: "link",
				url: "https://example.com/ingrid",
				children: [run("Ingrid")],
			}),
			"[Ingrid|https://example.com/ingrid]",
		],
		[
			"an email link",
			content({
				kind: "link",
				url: "mailto:ingrid@example.com",
				children: [run("Ingrid")],
			}),
			"[Ingrid|mailto:ingrid@example.com]",
		],
		[
			"an image",
			content({
				kind: "image",
				url: "https://example.com/rio.png",
				alt: "Rio at dusk",
			}),
			"!https://example.com/rio.png|alt=Rio at dusk!",
		],
	])("writes and reads %s in the canonical syntax", (_name, value, syntax) => {
		expect(writeJiraCell(value)).toBe(syntax);
		expect(cellValuesEqual(parseJiraCell(syntax), value)).toBe(true);
	});

	it.each([
		"2020-01-01",
		"snake_case_name",
		"a - b - c",
		"-5",
		"x+y+z",
		"*unfinished",
		"[not a link]",
		"Wow!|",
	])("keeps %j literal when read", (text) => {
		expect(typeof parseJiraCell(text)).toBe("string");
	});

	it.each([
		"2020-01-01",
		"-5",
		"a - b",
		"*Ingrid*",
		"-Madrid-",
		"{{age}}",
		"[Ingrid|https://example.com]",
		"!important",
		"Wow!",
		"a|b",
		"back\\slash",
		"line\nbreak",
	])("keeps the plain text %j exactly through a round trip", (text) => {
		expectRoundTrip(text);
	});

	it("writes ordinary dates and negative numbers exactly as they read", () => {
		expect(writeJiraCell("2020-01-01")).toBe("2020-01-01");
		expect(writeJiraCell("-5")).toBe("-5");
	});

	it("keeps a mark inside a word with a character reference beside it", () => {
		expectRoundTrip(content(run("Ri"), run("o", "bold"), run("s")));
		expectRoundTrip(content(run(" Paulo ", "underline"), run("x")));
	});

	it("keeps an authored URL and alternative text exactly", () => {
		for (const url of [
			"https://example.com/<pipe|and>",
			"with space",
			"a]b!c[d",
			"a\\b&c",
		]) {
			expectRoundTrip(
				content({ kind: "link", url, children: [run("Paulo", "italic")] }),
			);
			expectRoundTrip(content({ kind: "image", url, alt: "Madrid! | ok" }));
		}
	});

	it("splits a row around a link and an image, never at their own pipes", () => {
		const link = content({
			kind: "link",
			url: "https://example.com/ingrid",
			children: [run("Ingrid")],
		});
		const image = content({
			kind: "image",
			url: "https://example.com/rio.png",
			alt: "Rio",
		});
		const document = documentFromMatrix(
			[
				[link, "City"],
				["Ingrid", image],
			],
			{ headerRow: true },
		);
		const text = jiraCodec.serialize(document);
		const parsed = jiraCodec.parse(text);
		if (!parsed.ok) throw new Error(text);
		expect(parsed.document.columns).toHaveLength(2);
		expect(
			cellValuesEqual(parsed.document.columns[0]?.header ?? "", link),
		).toBe(true);
		const [row] = parsed.document.rows;
		const column = parsed.document.columns[1];
		if (!row || !column) throw new Error("missing cell");
		expect(cellValuesEqual(readCell(row, column.id), image)).toBe(true);
	});
});

// A link or image candidate that never completes is literal text, and neither
// the cell parser nor the row splitter may rescan the rest of the line from
// every opener inside it (#417). The bound is generous on purpose: the
// quadratic scan took seconds at this length and the linear one takes
// milliseconds. `pnpm bench` measures the growth.
const LONG_LITERAL = 64_000;
const SCAN_BUDGET_MS = 2_000;

describe("Jira link candidates that never complete (#417)", () => {
	const units = [
		["opening brackets", "["],
		["labels with a separator but no close", "[Rio|"],
		["escaped openers between brackets", "[\\["],
	] as const;

	it.each(units)("reads a long cell of %s as its own text", (_, unit) => {
		const raw = unit.repeat(Math.ceil(LONG_LITERAL / unit.length));
		const started = performance.now();
		const parsed = parseJiraCell(raw);
		const elapsed = performance.now() - started;
		expect(parsed).toBe(raw.replaceAll("\\[", "["));
		expect(elapsed).toBeLessThan(SCAN_BUDGET_MS);
		expectRoundTrip(parsed);
	});

	it.each(units)("splits a row holding a long cell of %s", (_, unit) => {
		const raw = unit.repeat(Math.ceil(LONG_LITERAL / unit.length));
		const cell = raw.replaceAll("|", "\\|");
		const started = performance.now();
		const parsed = jiraCodec.parse(`||note||\n|${cell}|\n`);
		const elapsed = performance.now() - started;
		if (!parsed.ok) throw new Error("the table did not parse");
		const [row] = parsed.document.rows;
		const [column] = parsed.document.columns;
		if (!row || !column) throw new Error("missing cell");
		expect(readCell(row, column.id)).toBe(raw.replaceAll("\\[", "["));
		expect(elapsed).toBeLessThan(SCAN_BUDGET_MS);
	});

	it("still finds a link after a candidate that never closes", () => {
		expect(
			cellValuesEqual(
				parseJiraCell("[Rio [Ingrid|https://example.com/ingrid]"),
				content({
					kind: "link",
					url: "https://example.com/ingrid",
					children: [run("Rio [Ingrid")],
				}),
			),
		).toBe(true);
		expect(
			cellValuesEqual(
				parseJiraCell("[Rio \\] [Ingrid|https://example.com/ingrid]"),
				content({
					kind: "link",
					url: "https://example.com/ingrid",
					children: [run("Rio ] [Ingrid")],
				}),
			),
		).toBe(true);
	});

	it("reads a separator after a run of backslashes by its own parity", () => {
		// `&#92;` is the literal backslash, `\\` the line break, `\|` a pipe.
		expect(
			cellValuesEqual(
				parseJiraCell("[Rio\\\\|https://example.com/rio]"),
				content({
					kind: "link",
					url: "https://example.com/rio",
					children: [run("Rio\n")],
				}),
			),
		).toBe(true);
		expect(parseJiraCell("[Rio\\|https://example.com/rio]")).toBe(
			"[Rio|https://example.com/rio]",
		);
	});
});
