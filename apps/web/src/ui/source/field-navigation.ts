import { indentLess, indentMore, insertNewline } from "@codemirror/commands";
import { indentOnInput, indentUnit } from "@codemirror/language";
import {
	EditorSelection,
	type Extension,
	type StateCommand,
} from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { SourceFieldRange } from "@/formats/types";
import type { SourceTabBehaviour } from "@/views/types";

// Tab inside a source editor, by the behaviour the view registry declares
// (#54). The editor asks for this extension by behaviour and never by view,
// and the fields come from the codec's own grammar, so nothing here knows a
// format. See docs/design-system.md, "The source-editor keyboard model".

// The field a Tab press lands on, as an offset, or null when the text has no
// fields at all. The caret belongs to the last field starting at or before it,
// so a caret on a delimiter or on a Markdown cell's padding still belongs to
// the field it follows. Both directions wrap: past the last field is the
// first, and before the first is the last.
export function adjacentFieldStart(
	fields: readonly SourceFieldRange[],
	head: number,
	direction: 1 | -1,
): number | null {
	if (fields.length === 0) return null;
	let current = -1;
	for (let index = 0; index < fields.length; index += 1) {
		const field = fields[index];
		if (!field || field.from > head) break;
		current = index;
	}
	const last = fields.length - 1;
	const target =
		direction === 1
			? current >= last
				? 0
				: current + 1
			: current <= 0
				? last
				: current - 1;
	return fields[target]?.from ?? null;
}

function moveToField(
	fieldsOf: () => ((text: string) => readonly SourceFieldRange[]) | undefined,
	direction: 1 | -1,
): StateCommand {
	return ({ state, dispatch }) => {
		const fields = fieldsOf()?.(state.doc.toString()) ?? [];
		const target = adjacentFieldStart(
			fields,
			state.selection.main.head,
			direction,
		);
		// The key is consumed either way: with no field to reach, the caret
		// stays where it is rather than focus leaving the pane.
		if (target === null) return true;
		dispatch(
			state.update({
				selection: EditorSelection.cursor(target),
				scrollIntoView: true,
				userEvent: "select",
			}),
		);
		return true;
	};
}

// Two spaces, which is what the JSON and HTML codecs write, so a line the user
// indents lines up with the ones the serializer wrote.
const INDENT_UNIT = "  ";

export function sourceTabExtension(
	behaviour: SourceTabBehaviour | null,
	fieldsOf: () => ((text: string) => readonly SourceFieldRange[]) | undefined,
): Extension {
	switch (behaviour) {
		case "next-field":
			return keymap.of([
				{
					key: "Tab",
					run: moveToField(fieldsOf, 1),
					shift: moveToField(fieldsOf, -1),
				},
				// Whitespace in these formats is data or padding, never
				// indentation. The default Enter re-indents the new line from the
				// one above and deletes the blank space after the caret, which in
				// TSV is the tab delimiters themselves. A plain line break keeps
				// the text exactly as typed.
				{ key: "Enter", run: insertNewline },
			]);
		case "indent":
			// Enter already continues at the syntactic depth through the
			// language's own indentation; indentOnInput re-indents a line when a
			// closing bracket or tag is typed on it.
			return [
				indentUnit.of(INDENT_UNIT),
				indentOnInput(),
				keymap.of([{ key: "Tab", run: indentMore, shift: indentLess }]),
			];
		default:
			return [];
	}
}
