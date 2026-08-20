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
	readTabeloPayload,
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

const PAYLOAD_PATTERN = /<!--tabelo:([\s\S]*?)-->/;

function tamper(html: string, replace: (encoded: string) => string): string {
	const encoded = PAYLOAD_PATTERN.exec(html)?.[1];
	if (encoded === undefined) throw new Error("no payload to tamper with");
	return html.replace(encoded, replace(encoded));
}

// The payload Tabelo actually wrote, as an object. Every forgery below starts
// from it and changes one thing, so each test isolates the rule it names
// rather than tripping the fingerprint on its way past.
function genuinePayload(
	selection: ClipboardSelection = typedSelection,
): Record<string, unknown> {
	const { html } = selectionClipboardPayload(selection);
	const encoded = PAYLOAD_PATTERN.exec(html)?.[1] ?? "";
	return JSON.parse(
		new TextDecoder().decode(
			Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)),
		),
	);
}

function forgedHtml(payload: unknown, matrix = typedSelection.matrix): string {
	const bytes = new TextEncoder().encode(JSON.stringify(payload));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `<!--tabelo:${btoa(binary)}-->${matrixToHtml(matrix)}`;
}

describe("the private clipboard payload", () => {
	it("round-trips every scalar and the expected column types", () => {
		const { html } = selectionClipboardPayload(typedSelection);

		expect(readTabeloPayload(html).selection).toEqual(typedSelection);
	});

	it("is invisible to the public HTML table it travels with", () => {
		const { html } = selectionClipboardPayload(typedSelection);

		// Both halves of the guarantee: the payload is stripped before parsing,
		// and it would still be inert if it were not.
		expect(readHtmlTable(html)?.matrix).toEqual([
			["Ingrid", "35", "true", ""],
			["Paulo", "35", "false", ""],
		]);
		expect(stripTabeloPayload(html)).toBe(matrixToHtml(typedSelection.matrix));
		expect(stripTabeloPayload(html)).not.toContain("tabelo:");
	});

	it("leaves HTML that carries no payload untouched", () => {
		const html = matrixToHtml([["Ingrid"]]);

		expect(readTabeloPayload(html)).toEqual({ html, selection: null });
	});

	it.each([
		["a truncated payload", (encoded: string) => encoded.slice(0, -8)],
		["bytes that are not base64", () => "not base64 at all"],
		["an empty payload", () => ""],
	])("falls back and still strips %s", (_name, replace) => {
		const { html } = selectionClipboardPayload(typedSelection);

		const read = readTabeloPayload(tamper(html, replace));

		expect(read.selection).toBeNull();
		expect(read.html).not.toContain("tabelo:");
	});

	// A value swapped for one that projects to the same text is the edit a
	// dimension check cannot see, so the fingerprint is what has to catch it.
	it("refuses a payload whose values no longer match its fingerprint", () => {
		const forged = forgedHtml({
			...genuinePayload(),
			matrix: [
				["Ingrid", "35", true, null],
				["Paulo", 35, false, ""],
			],
		});

		expect(readTabeloPayload(forged).selection).toBeNull();
	});

	it("refuses a version it does not know rather than guessing at it", () => {
		const forged = forgedHtml({
			...genuinePayload(),
			version: CLIPBOARD_PAYLOAD_VERSION + 1,
		});

		expect(readTabeloPayload(forged).selection).toBeNull();
	});

	it("refuses a key it did not write", () => {
		const forged = forgedHtml({
			...genuinePayload(),
			trailingKey: "unexpected",
		});

		expect(readTabeloPayload(forged).selection).toBeNull();
	});

	it.each([
		// JSON.stringify writes a non-finite number as null, so it cannot survive
		// the trip as the number it claims to be.
		["a non-finite number", Number.POSITIVE_INFINITY],
		["a nested array", [["deep"]]],
		["an object", { value: 1 }],
	])("refuses %s where a scalar belongs", (_name, value) => {
		const forged = forgedHtml({
			...genuinePayload(),
			matrix: [[value]],
		});

		expect(readTabeloPayload(forged).selection).toBeNull();
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

		const { html } = selectionClipboardPayload(selection);

		expect(html).not.toContain("tabelo:");
		// The values themselves still travel: it is only their types that do not.
		expect(readHtmlTable(html)?.matrix).toEqual([[enormous]]);
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
		const html = payload.html.replace(
			matrixToHtml(typedSelection.matrix),
			matrixToHtml([["Mabel", 45, true, null]]),
		);

		const table = readClipboardTable({ text: payload.text, html });

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

		expect(readTabeloPayload(payload.html).selection).not.toBeNull();
		expect(readClipboardTable(payload)?.source).toBe("html");
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
