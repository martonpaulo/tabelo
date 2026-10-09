import { bench, describe } from "vitest";
import { getCodec } from "@/formats";
import { parseJiraCell } from "@/formats/jira-inline";
import { parseMarkdownCell } from "@/formats/markdown-inline";
import { benchOptions, consumeDocument } from "@/testing/bench-fixtures";

// One long literal cell whose characters each begin a link candidate that never
// completes (#417). The figure that matters is growth: doubling the cell should
// roughly double the time, as it does for the plain control beside it. A cell is
// valid input at every size here, far below the import cap.

const SIZES = [2000, 4000, 8000, 16000] as const;

const shapes = {
	plain: "x",
	openBrackets: "[",
	openImages: "![",
} as const;

// One header and one row, so the whole parse, row splitter included, runs.
function markdownTable(cell: string): string {
	return `| note |\n| --- |\n| ${cell} |\n`;
}

function jiraTable(cell: string): string {
	return `||note||\n|${cell}|\n`;
}

const markdown = getCodec("markdown");
const jira = getCodec("jira");

for (const size of SIZES) {
	for (const [shape, unit] of Object.entries(shapes)) {
		const cell = unit.repeat(size / unit.length);
		const markdownSource = markdownTable(cell);
		const jiraSource = jiraTable(cell);
		const options = benchOptions(1000);

		describe(`inline scan, ${size} characters, ${shape}`, () => {
			bench(
				"markdown cell",
				() => {
					parseMarkdownCell(cell);
				},
				options,
			);
			bench(
				"markdown parse",
				() => {
					const result = markdown.parse(markdownSource);
					if (result.ok) consumeDocument(result.document);
				},
				options,
			);
			bench(
				"jira cell",
				() => {
					parseJiraCell(cell);
				},
				options,
			);
			bench(
				"jira parse",
				() => {
					const result = jira.parse(jiraSource);
					if (result.ok) consumeDocument(result.document);
				},
				options,
			);
		});
	}
}
