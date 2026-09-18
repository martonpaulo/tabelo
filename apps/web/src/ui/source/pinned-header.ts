import {
	EditorState,
	type Extension,
	Facet,
	Prec,
	RangeSetBuilder,
	StateEffect,
	StateField,
	type Text,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	lineNumbers,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import type { SourceRowRange } from "@/formats/types";
import { syntaxTheme } from "./editor-theme";
import { setSourceRows } from "./row-separators";

// The pinned header of a source view (#252): while the table's header row is
// scrolled out of sight, a copy of it stays at the top of the pane.
//
// Which text is the header is the format's answer, never the view's: it is the
// first row the codec's own parse maps (`SourceRowRange`, header first), the
// same rows the row boundaries of #296 follow. So Markdown pins its header line
// together with the alignment divider the codec counts as part of it, CSV and
// TSV pin a whole quoted multi-line record, and a format that maps no rows, or a
// draft that does not parse, pins nothing at all.
//
// The copy is a second, read-only CodeMirror view over the same text, with
// everything outside the header collapsed. That is what makes it the same
// rendering rather than a lookalike: the grammar sees the header in its real
// context, and the escape glyphs, whitespace and empty-value markers, font,
// zoom, wrapping, and line-number gutter all come from the same extensions the
// editor uses. It is a projection and nothing else: it holds no state the
// editor does not, it never edits, and it is inert and hidden from assistive
// technology, so the one header a reader can reach, select, or copy is the real
// line in the editor.

// The configuration the copy must share with the editor it copies: the
// language, the indicators, wrapping, and the zoom signal. The editor provides
// it and reconfigures it with its own compartments.
export const pinnedHeaderSetup = Facet.define<Extension, Extension>({
	combine: (values) => values.at(-1) ?? [],
});

// Where the header sits in the editor's text, from the latest row mapping.
// Typing between one parse and the next moves it with the text, the same way
// the row boundaries move; the next parse replaces it, or clears it.
const headerRange = StateField.define<SourceRowRange | null>({
	create: () => null,
	update(range, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setSourceRows)) {
				const { rows, length } = effect.value;
				const header = rows[0];
				return header &&
					length === transaction.state.doc.length &&
					header.to <= length
					? header
					: null;
			}
		}
		if (!range || !transaction.docChanged) return range;
		return {
			from: transaction.changes.mapPos(range.from, -1),
			to: transaction.changes.mapPos(range.to, 1),
		};
	},
});

// The header the pane would pin now, or null when there is none to claim.
export function pinnedHeaderRange(state: EditorState): SourceRowRange | null {
	return state.field(headerRange, false) ?? null;
}

// Inside the copy: every line outside the header collapses to nothing, so the
// copy is exactly as tall as the header and starts with it.
const setVisibleRange = StateEffect.define<SourceRowRange>();
const collapsed = Decoration.replace({ block: true });

function outsideHeader(doc: Text, range: SourceRowRange): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const first = doc.lineAt(Math.min(range.from, doc.length));
	const last = doc.lineAt(Math.min(range.to, doc.length));
	if (first.number > 1) builder.add(0, first.from - 1, collapsed);
	if (last.number < doc.lines) builder.add(last.to + 1, doc.length, collapsed);
	return builder.finish();
}

function visibleRangeField(initial: SourceRowRange) {
	return StateField.define<{
		range: SourceRowRange;
		decorations: DecorationSet;
	}>({
		create: (state) => ({
			range: initial,
			decorations: outsideHeader(state.doc, initial),
		}),
		update(value, transaction) {
			let range = value.range;
			for (const effect of transaction.effects) {
				if (effect.is(setVisibleRange)) range = effect.value;
			}
			if (range === value.range && !transaction.docChanged) return value;
			return {
				range,
				decorations: outsideHeader(transaction.state.doc, range),
			};
		},
		provide: (field) =>
			EditorView.decorations.from(field, (value) => value.decorations),
	});
}

// What only the copy needs: no editing, no focus, nothing but the header's own
// lines, and a scroller that follows the editor's rather than scrolling itself.
const copyExtensions: Extension = [
	lineNumbers(),
	syntaxTheme,
	EditorView.editable.of(false),
	EditorState.readOnly.of(true),
	EditorView.contentAttributes.of({ tabindex: "-1" }),
	// Above the shared theme, which pads the editor's last line for clicking
	// below it: the copy ends where the header ends.
	Prec.highest(
		EditorView.theme({
			"&": { height: "auto" },
			".cm-scroller": { overflow: "hidden" },
			".cm-content": { paddingBottom: "0" },
		}),
	),
];

interface Placement {
	readonly range: SourceRowRange;
	readonly width: number;
	readonly contentWidth: number;
	readonly scrollLeft: number;
	readonly height: number;
}

class PinnedHeader {
	private readonly overlay: HTMLElement;
	private copy: EditorView | null = null;
	// The copy's height while it is shown, which is how far a caret revealed
	// by scrolling has to stay below the top of the pane to be seen.
	margin = 0;

	constructor(private readonly view: EditorView) {
		this.overlay = document.createElement("div");
		this.overlay.className = "cm-tabeloPinnedHeader";
		this.overlay.setAttribute("aria-hidden", "true");
		this.overlay.inert = true;
		this.overlay.hidden = true;
		view.dom.appendChild(this.overlay);
		view.scrollDOM.addEventListener("scroll", this.schedule, { passive: true });
		view.scrollDOM.addEventListener("mousedown", this.onPointerDown, true);
		this.schedule();
	}

	update(update: ViewUpdate) {
		const range = pinnedHeaderRange(update.state);
		const rangeChanged = range !== pinnedHeaderRange(update.startState);
		const setupChanged =
			update.startState.facet(pinnedHeaderSetup) !==
			update.state.facet(pinnedHeaderSetup);

		const copy = this.copy;
		if (copy) {
			if (!range) {
				this.hide();
			} else {
				copy.dispatch({
					changes: update.changes,
					effects: [
						setVisibleRange.of(range),
						...(setupChanged
							? [
									StateEffect.reconfigure.of(
										this.copyConfiguration(range, update.state),
									),
								]
							: []),
					],
				});
			}
		}

		if (
			update.docChanged ||
			update.geometryChanged ||
			update.viewportChanged ||
			rangeChanged ||
			setupChanged
		) {
			this.schedule();
		}
	}

	destroy() {
		this.view.scrollDOM.removeEventListener("scroll", this.schedule);
		this.view.scrollDOM.removeEventListener(
			"mousedown",
			this.onPointerDown,
			true,
		);
		this.copy?.destroy();
		this.overlay.remove();
	}

	private readonly schedule = () => {
		this.view.requestMeasure({
			key: this,
			read: (view) => this.read(view),
			write: (placement) => this.write(placement),
		});
	};

	// The header is pinned once its first line has scrolled above the top of the
	// pane, never while any of the real header could still be read in place. So
	// a short or unscrolled document shows no copy, and because the copy floats
	// over the text rather than taking room from it, showing it moves nothing
	// and cannot scroll the editor into hiding it again.
	private read(view: EditorView): Placement | null {
		const range = pinnedHeaderRange(view.state);
		if (!range) return null;
		const scroller = view.scrollDOM;
		const top = view.lineBlockAt(range.from).top + view.documentPadding.top;
		if (scroller.scrollTop <= top) return null;
		return {
			range,
			width: scroller.clientWidth,
			contentWidth: view.contentDOM.getBoundingClientRect().width,
			scrollLeft: scroller.scrollLeft,
			height: this.copy ? this.overlay.getBoundingClientRect().height : 0,
		};
	}

	private write(placement: Placement | null) {
		if (!placement) {
			this.hide();
			return;
		}
		const created = !this.copy;
		const copy = this.copy ?? this.show(placement.range);
		// Pixel values straight from the editor's own measurement, applied to the
		// copy and never stored: the copy is exactly as wide as the editor's
		// visible text area, so it wraps where the editor wraps, and its text is
		// as wide as the editor's, so it can scroll as far sideways.
		this.overlay.style.width = `${placement.width}px`;
		copy.contentDOM.style.minWidth = `${placement.contentWidth}px`;
		copy.scrollDOM.scrollLeft = placement.scrollLeft;
		this.margin = placement.height;
		// The copy's height is known only once it has been laid out, and the
		// scroll margin depends on it, so a copy that was just created is read
		// once more.
		if (created) this.schedule();
	}

	private copyConfiguration(
		range: SourceRowRange,
		state: EditorState,
	): Extension {
		return [
			copyExtensions,
			state.facet(pinnedHeaderSetup),
			visibleRangeField(range),
		];
	}

	private show(range: SourceRowRange): EditorView {
		const copy = new EditorView({
			parent: this.overlay,
			state: EditorState.create({
				doc: this.view.state.doc,
				extensions: this.copyConfiguration(range, this.view.state),
			}),
		});
		this.copy = copy;
		this.overlay.hidden = false;
		return copy;
	}

	private hide() {
		if (!this.copy) return;
		this.copy.destroy();
		this.copy = null;
		this.overlay.hidden = true;
		this.margin = 0;
	}

	// The copy cannot be clicked into, because it is not the header. A press on
	// it goes to the real header instead: the caret lands at the same character
	// in the editor, which scrolls the header back into place to show it.
	private readonly onPointerDown = (event: MouseEvent) => {
		const copy = this.copy;
		if (!copy || event.button !== 0) return;
		const box = this.overlay.getBoundingClientRect();
		if (event.clientY >= box.bottom || event.clientX >= box.right) return;
		event.preventDefault();
		event.stopPropagation();
		const range = pinnedHeaderRange(this.view.state);
		const position =
			copy.posAtCoords({ x: event.clientX, y: event.clientY }) ??
			range?.from ??
			0;
		this.view.focus();
		this.view.dispatch({
			selection: { anchor: position },
			effects: EditorView.scrollIntoView(position, { y: "nearest" }),
			userEvent: "select.pointer",
		});
	};
}

const pinnedHeaderPlugin = ViewPlugin.fromClass(PinnedHeader, {
	provide: (plugin) =>
		EditorView.scrollMargins.of((view) => {
			const margin = view.plugin(plugin)?.margin ?? 0;
			return margin ? { top: margin } : null;
		}),
});

export const pinnedHeader: Extension = [headerRange, pinnedHeaderPlugin];
