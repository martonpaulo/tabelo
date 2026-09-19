import { describe, expect, it } from "vitest";
import { markdownCodec } from "./markdown";
import { markdownRowStartAssistance } from "./row-start-assistance";
import type { StructuralAssistance } from "./types";

function markdownAssistance(): StructuralAssistance {
	const assist = markdownCodec.structuralAssistance;
	if (!assist) throw new Error("Markdown declares no structural assistance.");
	return assist;
}

// Inserts one line break at `at`, the way Enter does, and applies whatever
// Markdown's assistance returns on top. Returns the final text.
function enter(before: string, at: number): string {
	const after = plain(before, at);
	const edit = markdownAssistance()(before, after, [{ from: at, to: at + 1 }]);
	if (!edit) return after;
	return after.slice(0, edit.from) + edit.insert + after.slice(edit.to);
}

// A plain line break at `at`, with nothing added.
function plain(text: string, at: number): string {
	return `${text.slice(0, at)}\n${text.slice(at)}`;
}

const table = [
	"| name   | city |",
	"| ------ | ---- |",
	"| Ingrid | Rio  |",
].join("\n");

describe("markdown row-start assistance", () => {
	it("opens a new row after a body row and after the divider", () => {
		expect(enter(table, table.length)).toBe(`${table}\n| `);
		expect(enter(table, table.lastIndexOf("\n"))).toBe(
			table.replace("|\n| Ingrid", "|\n| \n| Ingrid"),
		);
	});

	it("marks the insertion as where typing continues", () => {
		const after = `${table}\n`;
		expect(
			markdownAssistance()(table, after, [
				{ from: table.length, to: after.length },
			]),
		).toEqual({
			from: after.length,
			to: after.length,
			insert: "| ",
			caretAfter: true,
		});
	});

	it("leaves the line after the header for its divider", () => {
		const headerEnd = table.indexOf("\n");
		expect(enter(table, headerEnd)).toBe(plain(table, headerEnd));
	});

	it("inserts a plain break inside a row, off the table, or on a row with no opening pipe", () => {
		expect(enter(table, 3)).toBe(plain(table, 3));
		// A line of a later block, which the parser does not read as the table.
		const trailing = `${table}\n\n| note |`;
		expect(enter(trailing, trailing.length)).toBe(`${trailing}\n`);
		// Prose before the table.
		const prose = `Intro\n\n${table}`;
		expect(enter(prose, 5)).toBe(plain(prose, 5));
		// A row written without outer pipes has no opening delimiter to repeat.
		const bare = "name | city\n------ | ----\nIngrid | Rio";
		expect(enter(bare, bare.length)).toBe(`${bare}\n`);
	});

	it("acts on a lone line break only", () => {
		// The row-start feature alone: the divider feature answers a pasted row
		// of its own accord.
		const assist = markdownRowStartAssistance;
		const end = table.length;
		const pasted = `${table}\n| Paulo | Madrid |`;
		expect(assist(table, pasted, [{ from: end, to: pasted.length }])).toBe(
			null,
		);
		const dividerEnd = table.lastIndexOf("\n");
		const twoBreaks = `${plain(table, dividerEnd)}\n`;
		expect(
			assist(table, twoBreaks, [
				{ from: dividerEnd, to: dividerEnd + 1 },
				{ from: twoBreaks.length - 1, to: twoBreaks.length },
			]),
		).toBe(null);
		const typed = `${table}x`;
		expect(assist(table, typed, [{ from: end, to: end + 1 }])).toBe(null);
	});
});
