import { firstLineBlock, lineSpans } from "./parse";
import type { StructuralAssistance } from "./types";

// Markdown's row-start assistance (#391): Enter at the end of a table row
// starts the new line with the opening delimiter of a row, so typing the next
// row needs no extra keystrokes. It is a named structural-assistance feature
// under "Source text is free; structural assistance is narrow" in AGENTS.md:
//
// - Syntax: a line of the table block, the first block of non-blank lines that
//   the parser reads, whose first non-blank character is a pipe. The header
//   line is excluded, because the alignment divider has to follow it.
// - Trigger: one line break inserted at the very end of such a line, and
//   nothing else changed.
// - Change: `| ` inserted at the start of the new line, the opening pipe and
//   the padding the serializer writes after it. The caret lands after it, where
//   the cell's text goes.
//
// Everything else, including a break inside a row, a selection replaced by a
// break, several carets, or a pasted block, stays exactly as typed.
const ROW_OPENING = "| ";

export const markdownRowStartAssistance: StructuralAssistance = (
	before,
	after,
	changed,
) => {
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
	if (!block || lineIndex <= block.start || lineIndex >= block.end) {
		return null;
	}
	if (!lines[lineIndex]?.trimStart().startsWith("|")) return null;

	return { from: at + 1, to: at + 1, insert: ROW_OPENING, caretAfter: true };
};
