import {
	defaultKeymap,
	history,
	historyKeymap,
	redo,
	redoDepth,
	undo,
	undoDepth,
} from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import {
	Annotation,
	Compartment,
	EditorState,
	Prec,
	type Range,
	Transaction,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	hoverTooltip,
	keymap,
	lineNumbers,
	MatchDecorator,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
	notifyLocalHistoryChanged,
	registerLocalHistory,
} from "@/history/coordinator";
import type { HighlightLanguage } from "@/views/types";
import { csvLanguage } from "./csv-language";
import { syntaxTheme } from "./editor-theme";
import { htmlLanguage } from "./html-language";
import { jiraLanguage } from "./jira-language";

// Marks a transaction as coming from synchronization rather than the user.
// This is the loop guard required by docs/adr/0001: sync-originated changes
// never feed back into the parser, and never enter the local undo history.
const fromSync = Annotation.define<boolean>();

const languageCompartment = new Compartment();
const editableCompartment = new Compartment();
const diagnosticsCompartment = new Compartment();
const headerLineCompartment = new Compartment();
const attributesCompartment = new Compartment();
const zoomCompartment = new Compartment();

function zoomExtension(zoom: number) {
	return EditorView.theme({
		"&": { "--pane-zoom": String(zoom) },
	});
}

const markdownTableStructureMatcher = new MatchDecorator({
	regexp: /\||:?-{3,}:?/g,
	decoration: (match) =>
		Decoration.mark({
			class: match[0] === "|" ? "cm-tableDelimiter" : "cm-tableDivider",
		}),
});

const markdownTableStructure = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = markdownTableStructureMatcher.createDeco(view);
		}

		update(update: ViewUpdate) {
			this.decorations = markdownTableStructureMatcher.updateDeco(
				update,
				this.decorations,
			);
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);

export interface SourceDiagnostic {
	readonly line?: number;
	readonly message: string;
	readonly severity: "error" | "warning";
}

function diagnosticExtension(diagnostics: readonly SourceDiagnostic[]) {
	const byLine = new Map<number, readonly SourceDiagnostic[]>();
	for (const diagnostic of diagnostics) {
		const line = diagnostic.line ?? 1;
		byLine.set(line, [...(byLine.get(line) ?? []), diagnostic]);
	}

	const decorations = ViewPlugin.fromClass(
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
				const ranges: Range<Decoration>[] = [];
				for (const [lineNumber, lineDiagnostics] of byLine) {
					if (lineNumber < 1 || lineNumber > view.state.doc.lines) continue;
					const line = view.state.doc.line(lineNumber);
					if (line.from === line.to) continue;
					const severity = lineDiagnostics.some(
						(diagnostic) => diagnostic.severity === "error",
					)
						? "error"
						: "warning";
					ranges.push(
						Decoration.mark({
							class:
								severity === "error"
									? "cm-diagnosticError"
									: "cm-diagnosticWarning",
						}).range(line.from, line.to),
					);
				}
				return Decoration.set(ranges, true);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);

	const tooltip = hoverTooltip((view, position) => {
		const line = view.state.doc.lineAt(position);
		const messages = byLine.get(line.number);
		if (!messages?.length) return null;
		return {
			pos: line.from,
			end: line.to,
			above: true,
			create: () => {
				const dom = document.createElement("div");
				dom.className = "cm-diagnosticTooltip";
				dom.textContent = messages.map(({ message }) => message).join("\n");
				return { dom };
			},
		};
	});

	return [decorations, tooltip];
}

function headerLineExtension(language: HighlightLanguage) {
	if (
		language !== "markdown" &&
		language !== "delimited" &&
		language !== "jira" &&
		language !== "json"
	) {
		return [];
	}
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
				for (let number = 1; number <= view.state.doc.lines; number += 1) {
					const line = view.state.doc.line(number);
					// Only a line with no characters at all is skipped. A header row of
					// empty cells still has its delimiters, and in TSV those are tabs:
					// trimming would have discarded the header of every unnamed table,
					// which is what a new table now starts as.
					if (line.text === "") continue;
					if (
						language === "json" &&
						(line.text.trim() === "[" || line.text.trim() === "]")
					) {
						continue;
					}
					return Decoration.set([
						Decoration.line({ class: "cm-tableHeaderLine" }).range(line.from),
					]);
				}
				return Decoration.none;
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

function contentAttributes(
	ariaLabel: string,
	invalid: boolean,
	describedBy: string | undefined,
) {
	return {
		"aria-label": ariaLabel,
		...(invalid ? { "aria-invalid": "true" } : {}),
		...(describedBy ? { "aria-describedby": describedBy } : {}),
	};
}

// Highlighting is chosen by name so the registry never imports CodeMirror,
// which is what lets the whole editor stay in a lazily loaded chunk.
function languageFor(language: HighlightLanguage) {
	switch (language) {
		case "markdown":
			return [markdown(), markdownTableStructure];
		case "delimited":
			return csvLanguage;
		case "html":
			return htmlLanguage;
		case "jira":
			return jiraLanguage;
		case "json":
			return json();
		default:
			return [];
	}
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
	readonly paneId: string;
	readonly zoom: number;
	readonly value: string;
	readonly language: HighlightLanguage;
	readonly diagnostics: readonly SourceDiagnostic[];
	readonly invalid: boolean;
	readonly describedBy?: string;
	// Read-only views still get selection and copy, just no typing.
	readonly editable: boolean;
	readonly ariaLabel: string;
	readonly onChange: (value: string) => void;
	// Called when the editor's own history is exhausted. This is the fall-through
	// that makes undo layered rather than split: see docs/adr/0003.
	readonly onUndoBeyondLocal: () => void;
	readonly onRedoBeyondLocal: () => void;
}

export function SourceEditor({
	paneId,
	zoom,
	value,
	language,
	diagnostics,
	invalid,
	describedBy,
	editable,
	ariaLabel,
	onChange,
	onUndoBeyondLocal,
	onRedoBeyondLocal,
}: SourceEditorProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);

	// Handlers are read through refs so the editor is created exactly once.
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
					languageCompartment.of(languageFor(language)),
					diagnosticsCompartment.of(diagnosticExtension(diagnostics)),
					headerLineCompartment.of(headerLineExtension(language)),
					editableCompartment.of(EditorView.editable.of(editable)),
					syntaxTheme,
					attributesCompartment.of(
						EditorView.contentAttributes.of(
							contentAttributes(ariaLabel, invalid, describedBy),
						),
					),
					zoomCompartment.of(zoomExtension(zoom)),

					// Precedence matters: this must see Mod-z before the default
					// history keymap consumes it.
					Prec.high(
						keymap.of([
							{
								key: "Escape",
								preventDefault: true,
								run: (target) => {
									const panel = target.dom.closest(
										'[tabindex="0"]',
									) as HTMLElement | null;
									if (panel) panel.focus();
									return true;
								},
							},
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
						notifyLocalHistoryChanged();
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
		const unregisterHistory = registerLocalHistory(paneId, {
			undo: () => undo(view),
			redo: () => redo(view),
			canUndo: () => undoDepth(view.state) > 0,
			canRedo: () => redoDepth(view.state) > 0,
		});
		return () => {
			unregisterHistory();
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

	// The font size comes from the pane's CSS variable. CodeMirror cannot infer
	// that an ancestor variable changed, so explicitly remeasure its cursor,
	// lines, and gutters after each zoom step.
	useLayoutEffect(() => {
		if (zoom <= 0) return;
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: zoomCompartment.reconfigure(zoomExtension(zoom)),
		});
		view.requestMeasure();
	}, [zoom]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: [
				languageCompartment.reconfigure(languageFor(language)),
				headerLineCompartment.reconfigure(headerLineExtension(language)),
			],
		});
	}, [language]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: editableCompartment.reconfigure(
				EditorView.editable.of(editable),
			),
		});
	}, [editable]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: diagnosticsCompartment.reconfigure(
				diagnosticExtension(diagnostics),
			),
		});
	}, [diagnostics]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: attributesCompartment.reconfigure(
				EditorView.contentAttributes.of(
					contentAttributes(ariaLabel, invalid, describedBy),
				),
			),
		});
	}, [ariaLabel, invalid, describedBy]);

	return <div ref={hostRef} className="h-full min-h-0 [&_.cm-editor]:h-full" />;
}
