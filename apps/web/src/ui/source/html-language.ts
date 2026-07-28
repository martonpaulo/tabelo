import { StreamLanguage } from "@codemirror/language";

// A deliberately small HTML tokenizer. @codemirror/lang-html would pull full
// CSS and JavaScript grammars along with it, which is a lot of bundle to
// highlight a <table>. Tags, attributes, strings, comments, and entities are
// the whole surface this view ever shows.

interface HtmlState {
	inTag: boolean;
	inComment: boolean;
	inHeaderCell: boolean;
}

export const htmlLanguage = StreamLanguage.define<HtmlState>({
	name: "html",

	startState: () => ({ inTag: false, inComment: false, inHeaderCell: false }),

	token(stream, state) {
		if (state.inComment) {
			while (!stream.eol()) {
				if (stream.match("-->")) {
					state.inComment = false;
					break;
				}
				stream.next();
			}
			return "comment";
		}

		if (stream.match("<!--")) {
			state.inComment = true;
			return "comment";
		}

		if (state.inTag) {
			if (stream.match(/^\s+/)) return null;
			if (stream.match(/^\/?>/)) {
				state.inTag = false;
				return "punctuation";
			}
			if (stream.match(/^"[^"]*"|^'[^']*'/)) return "string";
			if (stream.eat("=")) return "punctuation";
			if (stream.match(/^[^\s=/>]+/)) return "attributeName";
			stream.next();
			return null;
		}

		const tag = stream.match(/^<\/?[A-Za-z][\w-]*/) as RegExpMatchArray | null;
		if (tag) {
			state.inTag = true;
			const name = tag[0].toLowerCase();
			if (name === "<th") state.inHeaderCell = true;
			if (name === "</th") state.inHeaderCell = false;
			return "tagName";
		}

		if (stream.match(/^&[#\w]+;/)) return "escape";

		// Plain text between tags is content, and content is what matters here.
		while (!stream.eol()) {
			const next = stream.peek();
			if (next === "<" || next === "&") break;
			stream.next();
		}
		return state.inHeaderCell ? "heading" : null;
	},
});
