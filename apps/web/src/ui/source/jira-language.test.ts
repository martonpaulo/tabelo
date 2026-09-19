import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { samplePerson } from "@/core/sample-data";
import { jiraLanguage } from "./jira-language";

// Every token the Jira view produces, as `[text, token]` pairs, parsed to the
// end of the document so a tokenizer that stalls throws here rather than later
// inside a mounted editor.
function tokens(doc: string): [string, string][] {
	const state = EditorState.create({ doc, extensions: jiraLanguage });
	const tree = ensureSyntaxTree(state, doc.length, 5000);
	if (!tree) throw new Error("the parse did not finish");
	const out: [string, string][] = [];
	tree.iterate({
		enter: (node) => {
			if (node.name === "Document") return;
			out.push([doc.slice(node.from, node.to), node.name]);
		},
	});
	return out;
}

const first = samplePerson(0);

describe("the Jira source tokenizer", () => {
	test("reads a line holding a backslash escape of any punctuation", () => {
		// The serializer protects `[`, `]`, `!`, `*` and friends with a backslash
		// wherever Jira could read them as syntax. The tokenizer once stopped at
		// such a backslash without consuming it, which CodeMirror rejects.
		const doc = [
			`||${first.name}||${first.city}||`,
			`|\\[${first.name}\\]|\\!x\\*|`,
		].join("\n");
		expect(() => tokens(doc)).not.toThrow();
		expect(tokens(doc).map(([text]) => text)).toContain("|");
	});

	test("still marks an escaped pipe and a line break as escapes", () => {
		expect(tokens("|a\\|b\\\\c|")).toEqual(
			expect.arrayContaining([
				["\\|", "escape"],
				["\\\\", "escape"],
			]),
		);
	});
});
