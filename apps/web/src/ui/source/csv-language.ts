import { StreamLanguage } from "@codemirror/language";

// CSV has no upstream CodeMirror grammar, and pulling a full parser in for a
// format this simple would be disproportionate. A stream tokenizer is enough
// to make the structure readable: quoted fields stand out from bare ones, and
// delimiters recede.

interface CsvState {
	// Tracks whether the tokenizer is inside a quoted field that spans lines,
	// which RFC 4180 allows and Tabelo explicitly supports.
	inQuotes: boolean;
}

export const csvLanguage = StreamLanguage.define<CsvState>({
	name: "csv",

	startState: () => ({ inQuotes: false }),

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
			return "string";
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
			return "string";
		}

		if (stream.eat(",") || stream.eat(";") || stream.eat("\t")) {
			return "punctuation";
		}

		while (!stream.eol()) {
			const next = stream.peek();
			if (next === "," || next === ";" || next === "\t" || next === '"') break;
			stream.next();
		}
		return null;
	},

	// A quoted field left open at end of line continues on the next one.
	blankLine(state) {
		if (!state.inQuotes) state.inQuotes = false;
	},
});
