import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { samplePerson } from "@/core/sample-data";
import { headerCellRanges, htmlLanguage } from "./html-language";

// Every token the HTML view produces, as `[text, token]` pairs. The token names
// come from the mode itself, so a test reads the same way the highlighter does.
function tokens(doc: string): [string, string][] {
	const state = EditorState.create({ doc, extensions: htmlLanguage });
	const out: [string, string][] = [];
	syntaxTree(state).iterate({
		enter: (node) => {
			// The root node spans the whole document and names no token.
			if (node.name === "Document") return;
			out.push([doc.slice(node.from, node.to), node.name]);
		},
	});
	return out;
}

// The source spans the header-cell decorator marks, which is the only thing
// Tabelo adds on top of the mode.
function headerCells(doc: string): string[] {
	const state = EditorState.create({ doc, extensions: htmlLanguage });
	const marked: string[] = [];
	headerCellRanges(state).between(0, doc.length, (from, to) => {
		marked.push(doc.slice(from, to));
	});
	return marked;
}

const first = samplePerson(0);
const second = samplePerson(1);

describe("the HTML source tokenizer", () => {
	test("returns the tag delimiters apart from the element name", () => {
		expect(tokens("<td>x</td>")).toEqual([
			["<", "angleBracket"],
			["td", "tagName"],
			[">", "angleBracket"],
			["</", "angleBracket"],
			["td", "tagName"],
			[">", "angleBracket"],
		]);
	});

	test("distinguishes a closing tag from an opening one", () => {
		const [opening, name, , closing, closingName] = tokens("<th>x</th>");
		// Both tags name the element, so the name alone cannot tell them apart.
		expect(name).toEqual(["th", "tagName"]);
		// The slash belongs to the delimiter, which is what makes the two differ:
		// it used to be swallowed into the name and painted as part of it.
		expect(opening).toEqual(["<", "angleBracket"]);
		expect(closing).toEqual(["</", "angleBracket"]);
		expect(closingName).toEqual(["th", "tagName"]);
	});

	test("marks a closing tag that opened nothing", () => {
		expect(tokens("</th>")).toContainEqual(["th>", "invalid"]);
	});

	test("names attributes and their quoted values", () => {
		expect(tokens('<td align="right">')).toEqual([
			["<", "angleBracket"],
			["td", "tagName"],
			["align", "attributeName"],
			['"right"', "string"],
			[">", "angleBracket"],
		]);
	});

	test("keeps entities and comments apart from content", () => {
		expect(tokens("<!-- note -->&amp;")).toEqual([
			["<!-- note -->", "comment"],
			["&amp;", "atom"],
		]);
	});

	test("marks malformed markup invalid rather than guessing", () => {
		expect(tokens("<p<>")).toContainEqual(["<>", "invalid"]);
	});

	test("leaves cell content untokenized", () => {
		expect(tokens(`<td>${first.city}</td>`)).not.toContainEqual([
			first.city,
			expect.anything(),
		]);
	});
});

describe("the header-cell decoration", () => {
	test("marks the contents of every th element", () => {
		const doc = `<tr><th>${first.name}</th><th>${first.city}</th></tr>`;
		expect(headerCells(doc)).toEqual([first.name, first.city]);
	});

	test("leaves data cells alone", () => {
		const doc = `<tr><td>${second.name}</td><td>${second.city}</td></tr>`;
		expect(headerCells(doc)).toEqual([]);
	});

	test("stops at the closing delimiter so it keeps its own treatment", () => {
		const doc = `<th>${first.name}</th>`;
		expect(headerCells(doc)).toEqual([first.name]);
		// The `</` that follows is left outside the marked span, so the closing
		// delimiter keeps the punctuation treatment every other delimiter has.
		expect(doc.slice(doc.indexOf(first.name) + first.name.length)).toBe(
			"</th>",
		);
	});

	test("covers markup nested inside a header cell", () => {
		expect(headerCells(`<th><b>${first.name}</b></th>`)).toEqual([
			`<b>${first.name}</b>`,
		]);
	});

	test("marks nothing for an empty or self-closed header cell", () => {
		expect(headerCells("<th></th>")).toEqual([]);
		expect(headerCells("<th/>")).toEqual([]);
	});

	test("spans the lines a header cell is broken across", () => {
		expect(headerCells(`<th>\n${first.name}\n</th>`)).toEqual([
			`\n${first.name}\n`,
		]);
	});
});
