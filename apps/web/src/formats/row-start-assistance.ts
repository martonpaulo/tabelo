import { firstLineBlock, lineSpans } from "./parse";
import type { StructuralAssistance } from "./types";

// Row-start assistance (#391): Enter at the end of a table row starts the new
// line with the opening delimiter of a row, so typing the next row needs no
// extra keystrokes. It is a named structural-assistance feature under "Source
// text is free; structural assistance is narrow" in AGENTS.md, declared by
// each pipe-delimited codec with the terms its grammar sets:
//
// - Syntax: a line of the table block, the first block of non-blank lines that
//   the parser reads, whose first non-blank character is a pipe. Whether the
//   header line counts is the format's: Markdown's alignment divider has to
//   follow its header, and Jira has no divider.
// - Trigger: one line break inserted at the very end of such a line, and
//   nothing else changed.
// - Change: the format's row opening inserted at the start of the new line.
//   The caret lands after it, where the cell's text goes.
//
// Everything else, including a break inside a row, a selection replaced by a
// break, several carets, or a pasted block, stays exactly as typed.
interface RowStartTerms {
	// What starts a row: the opening pipe, plus whatever padding the format's
	// serializer writes after it when that padding is not content.
	readonly opening: string;
	// Whether Enter at the end of the header line starts a row too.
	readonly afterHeader: boolean;
	// Whether the block's first line is a header this format reads. A draft
	// whose table has none is invalid, and stays exactly as typed.
	readonly isHeader?: (line: string) => boolean;
}

function rowStartAssistance(terms: RowStartTerms): StructuralAssistance {
	return (before, after, changed) => {
		const [edit, ...others] = changed;
		if (!edit || others.length > 0) return null;
		const at = edit.from;
		if (edit.to !== at + 1 || after.length !== before.length + 1) return null;
		if (after[at] !== "\n") return null;
		if (!after.startsWith(before.slice(0, at))) return null;
		if (!after.endsWith(before.slice(at))) return null;

		// The break must end a line of the draft before the edit.
		const lineIndex = lineSpans(before).findIndex(({ to }) => to === at);
		if (lineIndex === -1) return null;
		const lines = before.split(/\r?\n/);
		const block = firstLineBlock(lines);
		if (!block || lineIndex < block.start || lineIndex >= block.end) {
			return null;
		}
		if (lineIndex === block.start && !terms.afterHeader) return null;
		if (terms.isHeader && !terms.isHeader(lines[block.start] ?? "")) {
			return null;
		}
		if (!lines[lineIndex]?.trimStart().startsWith("|")) return null;

		return {
			from: at + 1,
			to: at + 1,
			insert: terms.opening,
			caretAfter: true,
		};
	};
}

// Markdown pads a cell with one space after its pipe, and that space is not
// content, so the new row opens with `| `. Its header line is followed by the
// alignment divider, never by a row.
export const markdownRowStartAssistance = rowStartAssistance({
	opening: "| ",
	afterHeader: false,
});

// Jira pads nothing: a space after the pipe would be the first character of
// the new row's first cell, so the row opens with the bare pipe. Jira has no
// divider, so the header line starts a row too (owner decision on #391).
export function jiraRowStartAssistance(
	isHeader: (line: string) => boolean,
): StructuralAssistance {
	return rowStartAssistance({ opening: "|", afterHeader: true, isHeader });
}
