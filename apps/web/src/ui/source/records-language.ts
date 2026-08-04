import { StreamLanguage } from "@codemirror/language";

interface RecordsState {
	// True from the start of a line until its colon-space separator is
	// consumed, so the title or bullet header can be styled distinctly from
	// its value.
	inHeader: boolean;
}

function finishLine(
	stream: { eol(): boolean },
	state: RecordsState,
	style: string | null,
) {
	if (stream.eol()) state.inHeader = true;
	return style;
}

// Records opens each record with a title line, `Header: Value`, and follows
// with hyphen bullets, `- Header: Value`. A stream tokenizer is enough to
// make the bullet marker and the header portion stand out, the same
// proportionate choice csv-language.ts and jira-language.ts already make for
// formats this small.
export const recordsLanguage = StreamLanguage.define<RecordsState>({
	name: "records",
	startState: () => ({ inHeader: true }),
	token(stream, state) {
		if (stream.match(/^-\s/)) {
			return finishLine(stream, state, "punctuation");
		}
		if (state.inHeader && stream.match(/^:\s?/)) {
			state.inHeader = false;
			return finishLine(stream, state, "punctuation");
		}
		while (!stream.eol()) {
			const next = stream.peek();
			if (next === ":" && state.inHeader) break;
			stream.next();
		}
		return finishLine(stream, state, state.inHeader ? "heading" : null);
	},
});
