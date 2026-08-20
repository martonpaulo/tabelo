import { StreamLanguage } from "@codemirror/language";

interface JiraState {
	header: boolean;
}

function finishLine(
	stream: { eol(): boolean },
	state: JiraState,
	style: string | null,
) {
	if (stream.eol()) state.header = false;
	return style;
}

// Jira table syntax is intentionally small: a double-pipe header followed by
// single-pipe rows. A stream tokenizer gives those delimiters and header cells
// useful structure without adding a parser dependency.
export const jiraLanguage = StreamLanguage.define<JiraState>({
	name: "jira-table",
	startState: () => ({ header: true }),
	token(stream, state) {
		if (stream.match(/^\\[|\\]/)) {
			return finishLine(stream, state, "escape");
		}
		if (stream.match(/^\|\|?/)) {
			// The header line's own delimiters wear the header treatment, so an
			// unnamed table still shows which line is the header. See the same
			// choice in csv-language.ts.
			return finishLine(
				stream,
				state,
				state.header ? "heading" : "punctuation",
			);
		}
		while (!stream.eol()) {
			const next = stream.peek();
			if (next === "|" || next === "\\") break;
			stream.next();
		}
		return finishLine(stream, state, state.header ? "heading" : null);
	},
});
