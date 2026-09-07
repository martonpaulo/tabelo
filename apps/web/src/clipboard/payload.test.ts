// @vitest-environment happy-dom
// The consistency check parses the public HTML table the payload travels
// beside, so these need the same DOM the HTML codec does.

import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { EXPECTED_COLUMN_TYPES } from "@/core/cell-value";
import { readHtmlTable } from "@/formats/html";
import {
	cellValueArbitrary,
	PROPERTY_RUNS,
} from "@/testing/property-arbitraries";
import { readClipboardTable } from "./parse";
import {
	CLIPBOARD_PAYLOAD_VERSION,
	type ClipboardSelection,
	decodeTabeloPayload,
	stripTabeloPayload,
} from "./payload";
import { matrixToHtml, selectionClipboardPayload } from "./serialize";

const typedSelection: ClipboardSelection = {
	matrix: [
		["Ingrid", 35, true, null],
		["Paulo", 35, false, ""],
	],
	expectedTypes: ["text", "number", "boolean", "text"],
};

// The payload Tabelo actually wrote, as an object. Every forgery below starts
// from it and changes one thing, so each test isolates the rule it names
// rather than tripping the fingerprint on its way past.
function genuinePayload(
	selection: ClipboardSelection = typedSelection,
): Record<string, unknown> {
	return JSON.parse(selectionClipboardPayload(selection).typed ?? "");
}

// The pre-flavour transport: the same JSON, base64-encoded into an HTML
// comment. Written only here now, because this is the one place that still has
// to prove Tabelo can read what an older build left on the system clipboard.
function legacyHtml(payload: unknown, matrix = typedSelection.matrix): string {
	const bytes = new TextEncoder().encode(JSON.stringify(payload));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `<!--tabelo:${btoa(binary)}-->${matrixToHtml(matrix)}`;
}

describe("the private clipboard payload", () => {
	it("round-trips every scalar and the expected column types", () => {
		const { typed } = selectionClipboardPayload(typedSelection);

		expect(decodeTabeloPayload(typed ?? "")).toEqual(typedSelection);
	});

	it("leaves the public HTML flavour carrying nothing but the table", () => {
		const { html } = selectionClipboardPayload(typedSelection);

		expect(html).toBe(matrixToHtml(typedSelection.matrix));
		expect(html).not.toContain("tabelo");
		expect(readHtmlTable(html)?.matrix).toEqual([
			["Ingrid", "35", "true", ""],
			["Paulo", "35", "false", ""],
		]);
	});

	it.each([
		["truncated bytes", (json: string) => json.slice(0, -8)],
		["bytes that are not JSON", () => "not json at all"],
		["nothing at all", () => ""],
	])("refuses %s", (_name, damage) => {
		const { typed } = selectionClipboardPayload(typedSelection);

		expect(decodeTabeloPayload(damage(typed ?? ""))).toBeNull();
	});

	// A value swapped for one that projects to the same text is the edit a
	// dimension check cannot see, so the fingerprint is what has to catch it.
	it("refuses a payload whose values no longer match its fingerprint", () => {
		const forged = JSON.stringify({
			...genuinePayload(),
			matrix: [
				["Ingrid", "35", true, null],
				["Paulo", 35, false, ""],
			],
		});

		expect(decodeTabeloPayload(forged)).toBeNull();
	});

	it("refuses a version it does not know rather than guessing at it", () => {
		const forged = JSON.stringify({
			...genuinePayload(),
			version: CLIPBOARD_PAYLOAD_VERSION + 1,
		});

		expect(decodeTabeloPayload(forged)).toBeNull();
	});

	it("refuses a key it did not write", () => {
		const forged = JSON.stringify({
			...genuinePayload(),
			trailingKey: "unexpected",
		});

		expect(decodeTabeloPayload(forged)).toBeNull();
	});

	it.each([
		// JSON.stringify writes a non-finite number as null, so it cannot survive
		// the trip as the number it claims to be.
		["a non-finite number", Number.POSITIVE_INFINITY],
		["a nested array", [["deep"]]],
		["an object", { value: 1 }],
	])("refuses %s where a scalar belongs", (_name, value) => {
		const forged = JSON.stringify({
			...genuinePayload(),
			matrix: [[value]],
		});

		expect(decodeTabeloPayload(forged)).toBeNull();
	});

	// The bound exists so an unbounded string never reaches the decoder. A
	// selection past it copies as text and HTML with no types attached, which
	// keeps every value and loses only what the public flavours never had.
	it("carries no payload for a selection too large to bound", () => {
		const enormous = "x".repeat(2_000_000);
		const selection: ClipboardSelection = {
			matrix: [[enormous]],
			expectedTypes: ["text"],
		};

		const payload = selectionClipboardPayload(selection);

		expect(payload.typed).toBeUndefined();
		// The values themselves still travel: it is only their types that do not.
		expect(readHtmlTable(payload.html)?.matrix).toEqual([[enormous]]);
	});
});

// An old build's copy sits in the system clipboard long after every tab has
// reloaded onto the new one, so both halves of the old transport still have to
// work: the marker is removed, and what it carried is still believed.
describe("the pre-flavour HTML-comment transport", () => {
	it("still hands a paste the values with their types", () => {
		const html = legacyHtml(genuinePayload());

		const table = readClipboardTable({ text: "", html });

		expect(table?.source).toBe("tabelo");
		expect(table?.matrix).toEqual(typedSelection.matrix);
		expect(table?.expectedTypes).toEqual(typedSelection.expectedTypes);
	});

	it("removes the marker before anything else reads the HTML", () => {
		const html = legacyHtml(genuinePayload());

		expect(stripTabeloPayload(html)).toBe(matrixToHtml(typedSelection.matrix));
		expect(stripTabeloPayload(html)).not.toContain("tabelo:");
	});

	it("leaves HTML that carries no marker untouched", () => {
		const html = matrixToHtml([["Ingrid"]]);

		expect(stripTabeloPayload(html)).toBe(html);
	});

	// A marker that arrives corrupted still has to be removed: left in place it
	// would reach a cell as text, which is the corruption the strip prevents.
	it("still strips a marker whose contents cannot be believed", () => {
		const html = legacyHtml(genuinePayload()).replace(
			/<!--tabelo:[\s\S]*?-->/,
			"<!--tabelo:not base64 at all-->",
		);

		const table = readClipboardTable({ text: "", html });

		expect(table?.source).toBe("html");
		expect(stripTabeloPayload(html)).not.toContain("tabelo:");
	});
});

describe("preferring the private payload", () => {
	it("hands a paste the values with their types", () => {
		const payload = selectionClipboardPayload(typedSelection);

		const table = readClipboardTable(payload);

		expect(table?.source).toBe("tabelo");
		expect(table?.matrix).toEqual(typedSelection.matrix);
		expect(table?.expectedTypes).toEqual(typedSelection.expectedTypes);
	});

	it("reads the public table when the payload describes a different one", () => {
		const payload = selectionClipboardPayload(typedSelection);
		// The metadata Tabelo wrote, beside a table it did not: exactly what a
		// stale or recombined clipboard looks like.
		const html = matrixToHtml([["Mabel", 45, true, null]]);

		const table = readClipboardTable({ ...payload, html });

		expect(table?.source).toBe("html");
		expect(table?.matrix).toEqual([["Mabel", "45", "true", ""]]);
		expect(table?.expectedTypes).toBeUndefined();
	});

	// A payload that validates and hashes correctly but describes fewer columns
	// than the table beside it still does not describe that table.
	it("reads the public table when the expected types do not cover it", () => {
		const payload = selectionClipboardPayload({
			matrix: typedSelection.matrix,
			expectedTypes: ["text"],
		});

		expect(decodeTabeloPayload(payload.typed ?? "")).not.toBeNull();
		expect(readClipboardTable(payload)?.source).toBe("html");
	});

	// The HTML flavour spells one line break, so a carriage return survives only
	// in the private payload. The consistency check has to compare on those
	// terms, or a single "\r" costs the whole selection its types (#218).
	it("keeps the payload when only a line-ending spelling differs", () => {
		const selection: ClipboardSelection = {
			matrix: [
				["Ingrid", "row-1:\r\n"],
				["Paulo", "\r"],
			],
			expectedTypes: ["text", "text"],
		};

		const table = readClipboardTable(selectionClipboardPayload(selection));

		expect(table?.source).toBe("tabelo");
		expect(table?.matrix).toEqual(selection.matrix);
		expect(table?.expectedTypes).toEqual(selection.expectedTypes);
	});

	// The public flavour every other application reads carries no stray control
	// character: the break is the <br>, and nothing beside it.
	it("writes no carriage return into the public HTML flavour", () => {
		expect(matrixToHtml([["a\r\nb"], ["c\rd"]])).not.toContain("\r");
	});

	// The rule the whole model rests on. External content is text, and text is
	// where no type came from.
	it("never types content that arrived from outside Tabelo", () => {
		const table = readClipboardTable({
			text: "age\n35",
			html: "<table><tr><td>age</td></tr><tr><td>35</td></tr></table>",
		});

		expect(table?.source).toBe("html");
		expect(table?.matrix).toEqual([["age"], ["35"]]);
	});
});

// Negative zero is excluded rather than asserted on. `JSON.stringify` writes
// it as `0`, so it is already indistinguishable from zero everywhere the
// product serializes a document, persistence and the JSON codec included.
// Generating it here would test a distinction Tabelo does not carry anywhere.
const clipboardCellValueArbitrary = cellValueArbitrary.filter(
	(value) => !Object.is(value, -0),
);

describe("private clipboard payload properties", () => {
	propertyTest.prop(
		[
			fc
				.record({
					width: fc.integer({ min: 1, max: 4 }),
					height: fc.integer({ min: 1, max: 5 }),
				})
				.chain(({ width, height }) =>
					fc.record({
						matrix: fc.array(
							fc.array(clipboardCellValueArbitrary, {
								minLength: width,
								maxLength: width,
							}),
							{ minLength: height, maxLength: height },
						),
						expectedTypes: fc.array(fc.constantFrom(...EXPECTED_COLUMN_TYPES), {
							minLength: width,
							maxLength: width,
						}),
					}),
				),
		],
		{ numRuns: PROPERTY_RUNS },
	)(
		"a selection survives the clipboard as the same values, not as their text",
		(selection) => {
			const payload = selectionClipboardPayload(selection);
			const table = readClipboardTable(payload);

			expect(table?.source).toBe("tabelo");
			expect(table?.matrix).toEqual(selection.matrix);
			expect(table?.expectedTypes).toEqual(selection.expectedTypes);
		},
	);
});
