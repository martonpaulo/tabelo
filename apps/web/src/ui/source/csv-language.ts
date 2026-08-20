import { StreamLanguage } from "@codemirror/language";

// CSV has no upstream CodeMirror grammar, and pulling a full parser in for a
// format this simple would be disproportionate. A stream tokenizer is enough
// to make the structure readable: quoted fields stand out from bare ones, and
// delimiters recede.

interface CsvState {
	// Tracks whether the tokenizer is inside a quoted field that spans lines,
	// which RFC 4180 allows and Tabelo explicitly supports.
	inQuotes: boolean;
	header: boolean;
}

function finishToken(
	stream: { eol(): boolean },
	state: CsvState,
	style: string | null,
) {
	if (stream.eol() && !state.inQuotes) state.header = false;
	return style;
}

export const csvLanguage = StreamLanguage.define<CsvState>({
	name: "csv",

	startState: () => ({ inQuotes: false, header: true }),

	token(stream, state) {
		if (state.inQuotes) {
			while (!stream.eol()) {
				if (stream.next() === '"') {
					// A doubled quote is an escaped quote, not the end of the field.
					if (stream.peek() === '"') {
						stream.next();
						continue;
					}
					state.inQuotes = false;
					break;
				}
			}
			return finishToken(stream, state, state.header ? "heading" : "string");
		}

		if (stream.eat('"')) {
			state.inQuotes = true;
			while (!stream.eol()) {
				if (stream.next() === '"') {
					if (stream.peek() === '"') {
						stream.next();
						continue;
					}
					state.inQuotes = false;
					break;
				}
			}
			return finishToken(stream, state, state.header ? "heading" : "string");
		}

		if (stream.eat(",") || stream.eat(";") || stream.eat("\t")) {
			// On the header line the delimiters carry the header treatment too, so
			// the whole line reads as the header even when its cells are empty,
			// which is what a table starts as. Markdown's own grammar marks its
			// header row the same way.
			return finishToken(
				stream,
				state,
				state.header ? "heading" : "punctuation",
			);
		}

		while (!stream.eol()) {
			const next = stream.peek();
			if (next === "," || next === ";" || next === "\t" || next === '"') break;
			stream.next();
		}
		return finishToken(stream, state, state.header ? "heading" : null);
	},

	// A quoted field left open at end of line continues on the next one.
	blankLine(state) {
		if (!state.inQuotes) state.header = false;
	},
});
