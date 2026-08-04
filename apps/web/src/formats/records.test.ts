import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { canSerialize } from "@/formats";
import { markdownCodec } from "./markdown";
import { recordsCodec } from "./records";

// The escaping contract from docs/adr/0002 is the one thing that must never
// regress: a value has to survive the round trip byte-exact. Same hostile
// values every codec's own test carries, plus the three collisions specific
// to this grammar: a header containing ": ", a value beginning "- ", and the
// bare trailing colon that means an empty value.

describe("records codec round trip", () => {
	const hostile = [
		"plain",
		"line one\nline two",
		"back\\slash",
		"trailing backslash \\",
		"has: colon",
		"- leading hyphen bullet",
		"everything: \n \\ - at once",
		"\\\\",
		"  leading and trailing  ",
	];

	it.each(hostile)("round-trips %j as the first column's value", (value) => {
		const document = documentFromMatrix(
			[
				["Name", "Note"],
				[value, "fixed"],
			],
			{ headerRow: true },
		);
		const parsed = recordsCodec.parse(recordsCodec.serialize(document));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(documentToMatrix(parsed.document)).toEqual(
			documentToMatrix(document),
		);
	});

	it.each(hostile)("round-trips %j as a bullet value", (value) => {
		const document = documentFromMatrix(
			[
				["Name", "Note"],
				["Ingrid", value],
			],
			{ headerRow: true },
		);
		const parsed = recordsCodec.parse(recordsCodec.serialize(document));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(documentToMatrix(parsed.document)).toEqual(
			documentToMatrix(document),
		);
	});

	it.each(["Note: detail", "Note\nBroken", "back\\slash"])(
		"round-trips %j as a header",
		(header) => {
			const document = documentFromMatrix(
				[
					["Name", header],
					["Ingrid", "value"],
				],
				{ headerRow: true },
			);
			const parsed = recordsCodec.parse(recordsCodec.serialize(document));
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(documentToMatrix(parsed.document)).toEqual(
				documentToMatrix(document),
			);
		},
	);

	it("matches the worked example from the issue", () => {
		const document = documentFromMatrix(
			[
				["Product", "Price", "Status"],
				["Product A", "€20", "Available"],
				["Product B", "€35", ""],
			],
			{ headerRow: true },
		);
		expect(recordsCodec.serialize(document)).toBe(
			[
				"Product: Product A",
				"- Price: €20",
				"- Status: Available",
				"",
				"Product: Product B",
				"- Price: €35",
				"- Status:",
			].join("\n"),
		);
	});

	it("splits a value containing the separator on the first occurrence only", () => {
		const document = documentFromMatrix(
			[
				["Product", "Price"],
				["Sale item", "Sale: €20"],
			],
			{ headerRow: true },
		);
		const text = recordsCodec.serialize(document);
		expect(text).toContain("- Price: Sale: €20");

		const parsed = recordsCodec.parse(text);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(documentToMatrix(parsed.document)).toEqual(
			documentToMatrix(document),
		);
	});

	it("keeps a trailing colon as an empty value rather than skipping the bullet", () => {
		const document = documentFromMatrix(
			[
				["Product", "Status"],
				["Product B", ""],
			],
			{ headerRow: true },
		);
		const parsed = recordsCodec.parse(recordsCodec.serialize(document));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(documentToMatrix(parsed.document)).toEqual([
			["Product", "Status"],
			["Product B", ""],
		]);
	});

	it("never repeats the first column as a bullet", () => {
		const document = documentFromMatrix(
			[
				["Product", "Price"],
				["Product A", "€20"],
			],
			{ headerRow: true },
		);
		const text = recordsCodec.serialize(document);
		expect(text.split("\n").filter((line) => line.startsWith("-"))).toEqual([
			"- Price: €20",
		]);
	});
});

describe("records output options", () => {
	const document = documentFromMatrix(
		[
			["Product", "Price", "Status"],
			["Product A", "€20", "Available"],
			["Product B", "€35", ""],
		],
		{ headerRow: true },
	);

	it("drops the first column's name from the title when disabled", () => {
		const text = recordsCodec.serialize(document, {
			includeFirstColumnName: false,
		});
		expect(text.split("\n")[0]).toBe("Product A");
		expect(text).not.toContain("Product: Product A");
	});

	it("drops bullets with an empty value when empty values are excluded", () => {
		const text = recordsCodec.serialize(document, {
			includeEmptyValues: false,
		});
		const secondRecord = text.split("\n\n")[1];
		expect(secondRecord).not.toContain("Status");
	});

	it("produces the neither-option example from the issue", () => {
		const text = recordsCodec.serialize(document, {
			includeFirstColumnName: false,
			includeEmptyValues: false,
		});
		expect(text).toBe(
			[
				"Product A",
				"- Price: €20",
				"- Status: Available",
				"",
				"Product B",
				"- Price: €35",
			].join("\n"),
		);
	});

	it("is unreachable from an editable pane: dropping the first column name breaks the title grammar", () => {
		const text = recordsCodec.serialize(document, {
			includeFirstColumnName: false,
		});
		// The title line is now a bare value with no colon, so the parser cannot
		// find the header/value boundary that makes the format editable.
		expect(recordsCodec.parse(text).ok).toBe(false);
	});

	it("is unreachable from an editable pane: excluding empty values can lose a later record's column", () => {
		const withAnEarlyEmptyCell = documentFromMatrix(
			[
				["Product", "Status"],
				["Product A", ""],
				["Product B", "Available"],
			],
			{ headerRow: true },
		);
		const text = recordsCodec.serialize(withAnEarlyEmptyCell, {
			includeEmptyValues: false,
		});
		// The first record's Status bullet is dropped because it is empty, so
		// "Status" never enters the header set the parser derives from record
		// one. The second record's Status bullet then names a column the parser
		// has never seen.
		expect(recordsCodec.parse(text).ok).toBe(false);
	});
});

describe("records preconditions", () => {
	it("blocks an empty first column header", () => {
		const document = documentFromMatrix(
			[
				["", "Price"],
				["Product A", "€20"],
			],
			{ headerRow: true },
		);
		expect(canSerialize(recordsCodec, document)).toEqual({
			code: "records-empty-first-header",
			columns: [0],
		});
	});

	it("blocks a header repeated among the remaining columns", () => {
		// headers.indexOf(header) always resolves to the first matching column,
		// so a second record's bullet for the repeated header would silently
		// overwrite the first occurrence and leave the other column empty.
		const document = documentFromMatrix(
			[
				["Product", "Age", "Age"],
				["Product A", "10", "20"],
			],
			{ headerRow: true },
		);
		expect(canSerialize(recordsCodec, document)).toEqual({
			code: "records-duplicate-header",
			columns: [1, 2],
		});
	});

	it("blocks the first column's header repeated on a later column", () => {
		const document = documentFromMatrix(
			[
				["Product", "Price", "Product"],
				["Product A", "€20", "Widget"],
			],
			{ headerRow: true },
		);
		expect(canSerialize(recordsCodec, document)).toEqual({
			code: "records-duplicate-header",
			columns: [0, 2],
		});
	});

	it("blocks an empty first column value, naming the offending row", () => {
		const document = documentFromMatrix(
			[
				["Product", "Price"],
				["Product A", "€20"],
				["", "€35"],
			],
			{ headerRow: true },
		);
		expect(canSerialize(recordsCodec, document)).toEqual({
			code: "records-empty-first-column",
			rows: [1],
		});
	});

	it("blocks a duplicated first column value, naming every occurrence", () => {
		const document = documentFromMatrix(
			[
				["Product", "Price"],
				["Product A", "€20"],
				["Product A", "€35"],
			],
			{ headerRow: true },
		);
		expect(canSerialize(recordsCodec, document)).toEqual({
			code: "records-duplicate-first-column",
			rows: [0, 1],
		});
	});

	it("allows a document with a non-empty, unique first column", () => {
		const document = documentFromMatrix(
			[
				["Product", "Price"],
				["Product A", "€20"],
				["Product B", "€35"],
			],
			{ headerRow: true },
		);
		expect(canSerialize(recordsCodec, document)).toBeNull();
	});
});

describe("records parsing", () => {
	it("rejects a later record whose title uses a different first column header", () => {
		const result = recordsCodec.parse(["Product: A", "", "Item: B"].join("\n"));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].code).toBe("records-title-mismatch");
	});

	it("rejects a line after the title that is not a hyphen bullet", () => {
		const result = recordsCodec.parse(["Product: A", "Price: 20"].join("\n"));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].code).toBe("records-bullet-required");
	});

	it("rejects a bullet naming a column the first record never declared", () => {
		const result = recordsCodec.parse(
			["Product: A", "- Price: 20", "", "Product: B", "- Weight: 3"].join("\n"),
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].code).toBe("records-unknown-column");
	});

	it("fills a missing bullet with an empty value and tolerates reordering", () => {
		const result = recordsCodec.parse(
			[
				"Product: A",
				"- Price: 20",
				"- Status: Available",
				"",
				"Product: B",
				"- Status: Sold",
			].join("\n"),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)).toEqual([
			["Product", "Price", "Status"],
			["A", "20", "Available"],
			["B", "", "Sold"],
		]);
	});

	it("reports an empty source", () => {
		const result = recordsCodec.parse("");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].code).toBe("empty-source");
	});
});

describe("records sniffing", () => {
	it("sorts after Markdown, so an ambiguous paste is always read as Markdown", () => {
		expect(recordsCodec.sniffPriority).toBeGreaterThan(
			markdownCodec.sniffPriority ?? 0,
		);
	});

	it("recognizes a title line followed by a hyphen bullet", () => {
		expect(recordsCodec.canSniff?.("Product: A\n- Price: 20")).toBe(true);
	});

	it("does not sniff an ordinary Markdown list", () => {
		expect(recordsCodec.canSniff?.("- item one\n- item two")).toBe(false);
	});

	it("does not sniff plain text with no title", () => {
		expect(recordsCodec.canSniff?.("just a line\nanother line")).toBe(false);
	});
});
