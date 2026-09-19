import { describe, expect, it } from "vitest";
import { samplePerson } from "@/core/sample-data";
import { csvCodec, markdownCodec, tsvCodec } from "@/formats";
import { fieldLineBreaks } from "./line-break-markers";

const first = samplePerson(0);
const second = samplePerson(1);

// The marker goes where the codec's own fields say a cell holds a newline, and
// nowhere a newline ends a row.
describe("fieldLineBreaks", () => {
	it("finds each break inside a quoted CSV field and no row break", () => {
		const text = [
			"name,note",
			`${first.name},"a`,
			"b",
			`c"`,
			`${second.name},plain`,
		].join("\n");
		const fields = csvCodec.sourceFields?.(text) ?? [];
		const breaks = fieldLineBreaks(text, fields);
		const quoted = text.indexOf('"a');
		expect(breaks).toEqual([
			text.indexOf("\n", quoted),
			text.indexOf("\n", text.indexOf("\n", quoted) + 1),
		]);
	});

	it("reads TSV through its own separator", () => {
		const text = ["name\tnote", `${first.name}\t"a`, `b"`].join("\n");
		const breaks = fieldLineBreaks(text, tsvCodec.sourceFields?.(text) ?? []);
		expect(breaks).toEqual([text.indexOf('"a') + 2]);
	});

	it("finds nothing where a format escapes its breaks", () => {
		// Markdown writes a cell's break as `<br>`, so every newline in its
		// source ends a line of the table, and none is inside a field.
		expect(markdownCodec.literalLineBreaks).toBeFalsy();
		expect(csvCodec.literalLineBreaks).toBe(true);
	});
});
