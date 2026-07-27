import {
	defaultKeymap,
	history,
	historyKeymap,
	redo,
	undo,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
	Annotation,
	Compartment,
	EditorState,
	Prec,
	Transaction,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { TextFormat } from "@/formats/types";
import { csvLanguage } from "./csv-language";
import { syntaxTheme } from "./editor-theme";

// Marks a transaction as coming from synchronization rather than the user.
// This is the loop guard required by docs/adr/0001: sync-originated changes
// never feed back into the parser, and never enter the local undo history.
const fromSync = Annotation.define<boolean>();

const languageCompartment = new Compartment();
const invalidLineCompartment = new Compartment();

const invalidLineMark = Decoration.line({ class: "cm-invalidLine" });

function invalidLineExtension(line: number | null) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.build(update.view);
				}
			}

			build(view: EditorView): DecorationSet {
				if (line === null || line < 1 || line > view.state.doc.lines) {
					return Decoration.none;
				}
				return Decoration.set([
					invalidLineMark.range(view.state.doc.line(line).from),
				]);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

function languageFor(format: TextFormat) {
	return format === "markdown" ? markdown() : csvLanguage;
}

// Replaces only what actually changed, so an external update does not blow the
// cursor to the end of the document. Shared prefix and suffix are preserved.
function minimalChange(current: string, next: string) {
	if (current === next) return null;

	let start = 0;
	const max = Math.min(current.length, next.length);
	while (start < max && current[start] === next[start]) start += 1;

	let endCurrent = current.length;
	let endNext = next.length;
	while (
		endCurrent > start &&
		endNext > start &&
		current[endCurrent - 1] === next[endNext - 1]
	) {
		endCurrent -= 1;
		endNext -= 1;
	}

	return { from: start, to: endCurrent, insert: next.slice(start, endNext) };
}

interface SourceEditorProps {
	readonly value: string;
	readonly format: TextFormat;
	readonly invalidLine: number | null;
	readonly ariaLabel: string;
	readonly onChange: (value: string) => void;
	// Called when the editor's own history is exhausted. This is the fall-through
	// that makes undo layered rather than split — see docs/adr/0003.
	readonly onUndoBeyondLocal: () => void;
	readonly onRedoBeyondLocal: () => void;
}

export function SourceEditor({
	value,
	format,
	invalidLine,
	ariaLabel,
	onChange,
	onUndoBeyondLocal,
	onRedoBeyondLocal,
}: SourceEditorProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);

	// Handlers are read through refs so the editor is created exactly once —
	// tearing it down on every render would destroy history and cursor state.
	const handlers = useRef({ onChange, onUndoBeyondLocal, onRedoBeyondLocal });
	handlers.current = { onChange, onUndoBeyondLocal, onRedoBeyondLocal };

	// The editor is created once and lives for the panel's lifetime. Re-running
	// this on a prop change would tear down CodeMirror and take the undo history
	// and caret with it; the values it closes over are applied by the effects
	// below instead.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: value,
				extensions: [
					lineNumbers(),
					history(),
					drawSelection(),
					highlightActiveLine(),
					highlightActiveLineGutter(),
					EditorView.lineWrapping,
					languageCompartment.of(languageFor(format)),
					invalidLineCompartment.of(invalidLineExtension(invalidLine)),
					syntaxTheme,
					EditorView.contentAttributes.of({ "aria-label": ariaLabel }),

					// Precedence matters: this must see Mod-z before the default
					// history keymap consumes it.
					Prec.high(
						keymap.of([
							{
								key: "Mod-z",
								preventDefault: true,
								run: (target) => {
									if (undo(target)) return true;
									handlers.current.onUndoBeyondLocal();
									return true;
								},
							},
							{
								key: "Mod-Shift-z",
								preventDefault: true,
								run: (target) => {
									if (redo(target)) return true;
									handlers.current.onRedoBeyondLocal();
									return true;
								},
							},
							{
								key: "Mod-y",
								preventDefault: true,
								run: (target) => {
									if (redo(target)) return true;
									handlers.current.onRedoBeyondLocal();
									return true;
								},
							},
						]),
					),
					keymap.of([...defaultKeymap, ...historyKeymap]),

					EditorView.updateListener.of((update) => {
						if (!update.docChanged) return;
						if (
							update.transactions.some((transaction) =>
								transaction.annotation(fromSync),
							)
						) {
							return;
						}
						handlers.current.onChange(update.state.doc.toString());
					}),
				],
			}),
		});

		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// Intentionally empty: the editor instance outlives prop changes, which
		// are applied through the effects below.
	}, []);

	// Push external text in without disturbing the caret or the local history.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const change = minimalChange(view.state.doc.toString(), value);
		if (!change) return;
		view.dispatch({
			changes: change,
			annotations: [fromSync.of(true), Transaction.addToHistory.of(false)],
		});
	}, [value]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: languageCompartment.reconfigure(languageFor(format)),
		});
	}, [format]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: invalidLineCompartment.reconfigure(
				invalidLineExtension(invalidLine),
			),
		});
	}, [invalidLine]);

	return <div ref={hostRef} className="h-full min-h-0 [&_.cm-editor]:h-full" />;
}
