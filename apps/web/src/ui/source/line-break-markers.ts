import type { Range, Text } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import type { SourceFieldRange } from "@/formats/types";
import { glyphMarker } from "./escape-sequences";
import { LINE_BREAK_GLYPH } from "./indicator-glyphs";

// A line break a cell holds as a real newline, as a quoted CSV or TSV field
// writes it, marked with the same `¶` an escaped break is drawn as (owner,
// 2026-09-19). The file already breaks the line there, so nothing is replaced:
// the mark is a zero-length widget at the end of the visual line where the
// break falls, drawn for the eye only.
//
// Which newlines belong to a cell is the codec's answer, never the editor's:
// the fields its grammar finds (`sourceFields`), which is also what Tab moves
// between. A newline inside a field is a break the cell holds; every other
// newline ends a row.

class LineBreakWidget extends WidgetType {
	toDOM() {
		const marker = glyphMarker(LINE_BREAK_GLYPH, 1);
		// Nothing in the file sits under it, so unlike an escape glyph there is
		// no spelling to keep in the accessible tree.
		marker.setAttribute("aria-hidden", "true");
		return marker;
	}

	eq() {
		return true;
	}
}

const lineBreak = Decoration.widget({ widget: new LineBreakWidget(), side: 1 });

// Every newline inside a field, as a document offset. Exported for the unit
// tests, which pin the rule without an editor.
export function fieldLineBreaks(
	text: string,
	fields: readonly SourceFieldRange[],
): number[] {
	const breaks: number[] = [];
	for (const { from, to } of fields) {
		let at = text.indexOf("\n", from);
		while (at !== -1 && at < to) {
			breaks.push(at);
			at = text.indexOf("\n", at + 1);
		}
	}
	return breaks;
}

function buildMarkers(
	doc: Text,
	sourceFields: (text: string) => readonly SourceFieldRange[],
): DecorationSet {
	const text = doc.toString();
	const ranges: Range<Decoration>[] = fieldLineBreaks(
		text,
		sourceFields(text),
	).map((at) => lineBreak.range(at));
	return Decoration.set(ranges, true);
}

// The whole document is read once per change rather than per viewport,
// because a quoted field can open above the viewport and break inside it. At
// the product's target scale that is one pass over a few hundred rows, the
// same pass Tab already makes.
export function literalLineBreakMarkers(
	sourceFields: (text: string) => readonly SourceFieldRange[],
) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildMarkers(view.state.doc, sourceFields);
			}

			update(update: ViewUpdate) {
				if (update.docChanged) {
					this.decorations = buildMarkers(update.state.doc, sourceFields);
				}
			}
		},
		{ decorations: (instance) => instance.decorations },
	);
}
