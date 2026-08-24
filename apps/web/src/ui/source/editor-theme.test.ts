import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { classHighlighter, highlightTree, tags } from "@lezer/highlight";
import { describe, expect, test } from "vitest";
import { samplePerson } from "@/core/sample-data";
import { csvLanguage } from "./csv-language";
import { highlightStyle } from "./editor-theme";
import { htmlLanguage } from "./html-language";
import { jiraLanguage } from "./jira-language";
import { recordsLanguage } from "./records-language";

const first = samplePerson(0);
const second = samplePerson(1);

// One document per installed grammar, wide enough to reach the constructs the
// views actually produce.
interface Grammar {
	readonly extension: Extension;
	readonly doc: string;
}

const markdownGrammar: Grammar = {
	extension: markdown({ base: markdownLanguage }),
	doc: [
		"| name | age |",
		"| :--- | ---: |",
		`| ${first.name} | ${first.age} |`,
		`| a \\| b | *${second.city}* ~~x~~ \`c\` [t](https://example.test) |`,
	].join("\n"),
};

const grammars: Record<string, Grammar> = {
	markdown: markdownGrammar,
	json: {
		extension: json(),
		doc: `[{"name":"${first.name}","age":${first.age},"ok":true,"note":null}]`,
	},
	html: {
		extension: htmlLanguage,
		doc: `<table><tr><th align="right">name &amp; age</th></tr><!-- c --><tr><td>${first.name}</td></tr></table>`,
	},
	delimited: {
		extension: csvLanguage,
		doc: `name,age\n"${first.name}",${first.age}`,
	},
	jira: {
		extension: jiraLanguage,
		doc: `||name||age||\n|${first.name}\\|x|${first.age}|`,
	},
	records: {
		extension: recordsLanguage,
		doc: `name: ${first.name}\n- age: ${first.age}`,
	},
};

// Which highlighting tags a grammar actually emits for a document, named the
// way @lezer/highlight names them, and whether the product's style resolves
// each one to a rule.
function emittedTags(extension: Extension, doc: string) {
	const state = EditorState.create({ doc, extensions: extension });
	const tree = syntaxTree(state);
	const named = new Map<string, { from: number; to: number }[]>();
	highlightTree(tree, classHighlighter, (from, to, classes) => {
		for (const cls of classes.split(" ")) {
			const name = cls.replace(/^tok-/, "");
			named.set(name, [...(named.get(name) ?? []), { from, to }]);
		}
	});
	const styled = new Set<string>();
	highlightTree(tree, highlightStyle, (from, to) => {
		for (const [name, ranges] of named) {
			if (ranges.some((range) => range.from === from && range.to === to)) {
				styled.add(name);
			}
		}
	});
	return { emitted: new Set(named.keys()), styled };
}

// The tags the installed grammars emit that the style leaves at the pane's
// plain foreground on purpose. Every one of them is the user's own text or a
// literal whose type is carried by the document rather than read off the
// source: see the recorded reasons in editor-theme.ts.
const intentionallyPlain = new Set(["content", "list", "labelName", "quote"]);

function rulesFor(tag: Parameters<typeof highlightStyle.style>[0][number]) {
	const className = highlightStyle.style([tag]);
	const rules = highlightStyle.module?.getRules() ?? "";
	expect(className).not.toBeNull();
	const match = rules.match(new RegExp(`\\.${className}[^\\{]*\\{([^}]*)\\}`));
	expect(match).not.toBeNull();
	return match?.[1] ?? "";
}

describe("the shared highlight style", () => {
	for (const [name, { extension, doc }] of Object.entries(grammars)) {
		test(`covers or deliberately skips every tag ${name} emits`, () => {
			const { emitted, styled } = emittedTags(extension, doc);
			// A grammar that emits nothing would make this test vacuous.
			expect(emitted.size).toBeGreaterThan(0);
			const unaccounted = [...emitted].filter(
				(tag) => !styled.has(tag) && !intentionallyPlain.has(tag),
			);
			expect(unaccounted).toEqual([]);
		});
	}

	test("never spends a status colour on syntax", () => {
		// `--status-warning` means one thing, a source that parsed with a
		// non-blocking warning. An escaped pipe or an attribute name is not one,
		// and reusing the colour would leave the token carrying two meanings.
		const rules = highlightStyle.module?.getRules() ?? "";
		expect(rules).not.toContain("--status-warning");
	});

	test("maps scalar values and notation to their semantic treatments", () => {
		expect(rulesFor(tags.punctuation)).toContain("--muted-foreground");
		expect(rulesFor(tags.propertyName)).toContain("font-weight: 600");
		expect(rulesFor(tags.string)).toContain("--value-string");
		expect(rulesFor(tags.number)).toContain("--value-number");
		expect(rulesFor(tags.bool)).toContain("--value-boolean");
		// The generic class highlighter calls this a keyword, but the JSON grammar
		// exposes the narrower null tag to a semantic HighlightStyle.
		expect(rulesFor(tags.null)).toContain("--value-null");
		expect(rulesFor(tags.tagName)).toContain("--syntax-notation");
		expect(rulesFor(tags.link)).toContain("--syntax-link");
		expect(rulesFor(tags.invalid)).toContain("--destructive");
	});

	test("separates a header cell from the data below it without colour", () => {
		const { doc, extension } = markdownGrammar;
		const state = EditorState.create({ doc, extensions: extension });
		const bold: string[] = [];
		highlightTree(syntaxTree(state), highlightStyle, (from, to, classes) => {
			const rules = highlightStyle.module?.getRules() ?? "";
			for (const cls of classes.split(" ")) {
				if (new RegExp(`\\.${cls}[^{]*\\{[^}]*font-weight`).test(rules)) {
					bold.push(doc.slice(from, to));
				}
			}
		});
		expect(bold).toContain(" name ");
		expect(bold).not.toContain(` ${first.name} `);
	});
});
