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
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
	Annotation,
	Compartment,
	EditorSelection,
	EditorState,
	type Extension,
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
	highlightWhitespace,
	hoverTooltip,
	keymap,
	lineNumbers,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
	notifyLocalHistoryChanged,
	registerLocalHistory,
} from "@/history/coordinator";
import type { SpaceIndicators } from "@/preferences/contract";
import type { HighlightLanguage, ViewId } from "@/views/types";
import { csvLanguage } from "./csv-language";
import { syntaxTheme } from "./editor-theme";
import { emptyValueMarkers, emptyValueSyntax } from "./empty-values";
import { htmlHeaderCells, htmlLanguage } from "./html-language";
import { jiraLanguage } from "./jira-language";
import { minimalChange } from "./minimal-change";
import {
	type OccurrenceSummary,
	occurrenceSummary,
	selectNextOccurrenceAsPrimary,
} from "./occurrence-selection";
import { recordsLanguage } from "./records-language";
import { indicatorClasses, spaceScope } from "./whitespace-indicators";

// Marks a transaction as coming from synchronization rather than the user.
// This is the loop guard required by docs/adr/0001: sync-originated changes
// never feed back into the parser, and never enter the local undo history.
const fromSync = Annotation.define<boolean>();

const languageCompartment = new Compartment();
const editableCompartment = new Compartment();
const diagnosticsCompartment = new Compartment();
const attributesCompartment = new Compartment();
const historyCompartment = new Compartment();
const metricsCompartment = new Compartment();
const wrapCompartment = new Compartment();
const indicatorCompartment = new Compartment();

// Everything the editor draws at the pane's scale, the text, the gutter width,
// and the caret, reads `--pane-zoom` from the cascade, and the pane body is the
// only thing that sets it: see docs/design-system.md, "Per-pane content scale".
// So a zoom step never touches the editor's own configuration, and CodeMirror
// has no way to know that the line heights and character width it caches, and
// positions the line numbers and the caret from, have just changed underneath
// it. Asking for a measurement is not enough on its own: the pass it schedules
// keeps the cached metrics unless something first marks them stale, and a theme
// change is what marks them. Each zoom level therefore gets its own theme,
// carrying no rules at all: the identity change is the entire point, and the
// scale itself keeps its single owner. Levels are reused rather than rebuilt,
// so stepping up and down does not register a new theme every time.
const metricsSignals = new Map<number, Extension>();

function metricsSignal(zoom: number): Extension {
	const known = metricsSignals.get(zoom);
	if (known) return known;
	const signal = EditorView.theme({});
	metricsSignals.set(zoom, signal);
	return signal;
}

function wrapExtension(wrap: boolean) {
	return wrap ? EditorView.lineWrapping : [];
}

// The indicators, from the three global preferences that own them. Spaces,
// tabs, and empty values answer different questions and are chosen separately.
//
// `highlightWhitespace()` supplies one span per space and per tab; which of
// those spans actually shows a glyph is decided in editor-theme.ts, from the
// classes below and from the scope a space mode marks. Splitting it that way
// keeps one owner for what a marker looks like, and means changing a mode
// never changes what is in the document: every one of these is a decoration,
// so none of them can reach the text, the draft, the clipboard, a download,
// or the history timeline.
function indicatorExtensions(
	spaces: SpaceIndicators,
	tabs: boolean,
	emptyValues: boolean,
	language: HighlightLanguage,
	fieldSeparator: string | undefined,
): Extension {
	const marksWhitespace = tabs || spaces !== "none";
	const syntax = emptyValues
		? emptyValueSyntax(language, fieldSeparator)
		: null;
	const classes = indicatorClasses(spaces, tabs);

	return [
		marksWhitespace ? highlightWhitespace() : [],
		spaceScope(spaces),
		syntax ? emptyValueMarkers(syntax) : [],
		classes ? EditorView.editorAttributes.of({ class: classes }) : [],
	];
}

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
			// Every tooltip in the product points at what it explains. This one
			// is drawn by CodeMirror and coloured in the editor theme.
			arrow: true,
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

function contentAttributes(
	ariaLabel: string,
	invalid: boolean,
	describedBy: string | undefined,
	entered: boolean,
) {
	return {
		"aria-label": ariaLabel,
		tabindex: entered ? "0" : "-1",
		...(invalid ? { "aria-invalid": "true" } : {}),
		...(describedBy ? { "aria-describedby": describedBy } : {}),
	};
}

// Highlighting is chosen by name so the registry never imports CodeMirror,
// which is what lets the whole editor stay in a lazily loaded chunk.
function languageFor(language: HighlightLanguage) {
	switch (language) {
		case "markdown":
			// The GFM base is what parses the table itself, so the header cells,
			// the row pipes, and the alignment divider arrive as grammar tokens
			// rather than as a project-owned decoration matching them by regexp.
			return markdown({ base: markdownLanguage });
		case "delimited":
			return csvLanguage;
		case "html":
			return [htmlLanguage, htmlHeaderCells];
		case "jira":
			return jiraLanguage;
		case "json":
			return json();
		case "records":
			return recordsLanguage;
		default:
			return [];
	}
}

interface SourceEditorProps {
	readonly paneId: string;
	// Which view this editor is currently serving. The editor outlives a view
	// change, so this is what tells it that its text has started meaning
	// something else.
	readonly viewId: ViewId;
	readonly zoom: number;
	readonly wrap: boolean;
	readonly value: string;
	readonly language: HighlightLanguage;
	// The three global display preferences from #93, and the separator this
	// view's format writes, which is what tells the empty-value marker where a
	// field ends. All of them are read here rather than stored: no pane owns
	// any of them.
	readonly spaceIndicators: SpaceIndicators;
	readonly tabIndicators: boolean;
	readonly emptyValueIndicators: boolean;
	readonly fieldSeparator?: string;
	readonly diagnostics: readonly SourceDiagnostic[];
	readonly invalid: boolean;
	readonly entered: boolean;
	readonly describedBy?: string;
	// Read-only views still get selection and copy, just no typing.
	readonly editable: boolean;
	readonly ariaLabel: string;
	readonly onChange: (value: string) => void;
	// Called when the editor's own history is exhausted. This is the fall-through
	// that makes undo layered rather than split: see docs/adr/0003.
	readonly onUndoBeyondLocal: () => void;
	readonly onRedoBeyondLocal: () => void;
	// How many equal occurrences are selected, for the pane header to show.
	// Transient CodeMirror state, reported rather than stored: it reaches
	// neither the document, the draft, nor workspace persistence.
	readonly onOccurrencesChange: (summary: OccurrenceSummary | null) => void;
	// Each successful Mod+D, separately from the summary above, because only the
	// press is worth speaking: a selection collapsing is not news.
	readonly onOccurrenceAdded: (summary: OccurrenceSummary) => void;
}

export function SourceEditor({
	paneId,
	viewId,
	zoom,
	wrap,
	value,
	language,
	spaceIndicators,
	tabIndicators,
	emptyValueIndicators,
	fieldSeparator,
	diagnostics,
	invalid,
	entered,
	describedBy,
	editable,
	ariaLabel,
	onChange,
	onUndoBeyondLocal,
	onRedoBeyondLocal,
	onOccurrencesChange,
	onOccurrenceAdded,
}: SourceEditorProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);

	// Handlers are read through refs so the editor is created exactly once.
	// tearing it down on every render would destroy history and cursor state.
	const handlers = useRef({
		onChange,
		onUndoBeyondLocal,
		onRedoBeyondLocal,
		onOccurrencesChange,
		onOccurrenceAdded,
	});
	handlers.current = {
		onChange,
		onUndoBeyondLocal,
		onRedoBeyondLocal,
		onOccurrencesChange,
		onOccurrenceAdded,
	};

	// The editor is created once and lives for the panel's lifetime. Re-running
	// this on a prop change would tear down CodeMirror and take the undo history
	// and caret with it; the values it closes over are applied by the effects
	// below instead.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: value,
				extensions: [
					lineNumbers(),
					historyCompartment.of(history()),
					// Without this, every range CodeMirror adds collapses back to one.
					// It is what makes Mod+D, and editing all of its ranges through a
					// single transaction, possible at all.
					EditorState.allowMultipleSelections.of(true),
					drawSelection(),
					highlightActiveLine(),
					highlightActiveLineGutter(),
					wrapCompartment.of(wrapExtension(wrap)),
					indicatorCompartment.of(
						indicatorExtensions(
							spaceIndicators,
							tabIndicators,
							emptyValueIndicators,
							language,
							fieldSeparator,
						),
					),
					languageCompartment.of(languageFor(language)),
					diagnosticsCompartment.of(diagnosticExtension(diagnostics)),
					editableCompartment.of(EditorView.editable.of(editable)),
					syntaxTheme,
					attributesCompartment.of(
						EditorView.contentAttributes.of(
							contentAttributes(ariaLabel, invalid, describedBy, entered),
						),
					),
					metricsCompartment.of(metricsSignal(zoom)),

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
								// Deliberately without `preventDefault`: CodeMirror then
								// swallows the key only when this returns true, which is
								// what keeps a caret, a read-only view, or a selection of
								// differing text from suppressing the browser's own Mod+D.
								key: "Mod-d",
								run: (target) => {
									if (!selectNextOccurrenceAsPrimary(target)) return false;
									const summary = occurrenceSummary(target.state);
									if (summary) handlers.current.onOccurrenceAdded(summary);
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
						// The header's summary is derived on every update that could
						// change it, never stored. Collapsing the selection, editing the
						// ranges apart, or losing a match to a text change all reach the
						// header through this one path.
						if (update.selectionSet || update.docChanged) {
							handlers.current.onOccurrencesChange(
								occurrenceSummary(update.state),
							);
						}
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
		// Mount before paint and measure once the editor is attached. Source panes
		// can appear as a dialog closes or a layout changes, and waiting for focus
		// would leave wrapped line numbers positioned from stale geometry.
		view.requestMeasure();
		// CodeMirror deliberately ignores resize notifications that arrive very
		// close to its own document update. A pane can change size in that exact
		// window when a view or layout dialog closes, leaving the gutter stale until
		// focus. The pane owns that resize, so observe its two real layout boxes and
		// request a measure for every settled browser size notification.
		const geometryObserver = new ResizeObserver(() => view.requestMeasure());
		geometryObserver.observe(host);
		geometryObserver.observe(view.scrollDOM);
		const unregisterHistory = registerLocalHistory(paneId, {
			undo: () => undo(view),
			redo: () => redo(view),
			canUndo: () => undoDepth(view.state) > 0,
			canRedo: () => redoDepth(view.state) > 0,
		});
		return () => {
			geometryObserver.disconnect();
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

	// Marking the cached metrics stale in the commit that publishes the new scale
	// has CodeMirror remeasure before that frame is painted, so the line numbers
	// and the caret land with the resized text rather than settling after it.
	useLayoutEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: metricsCompartment.reconfigure(metricsSignal(zoom)),
		});
	}, [zoom]);

	// A view change reuses this editor, so its local history would otherwise
	// still describe text in the format the pane has left. Undo has to stop at
	// the switch and fall through to the document timeline from there, per
	// docs/adr/0003. Dropping the history field and adding it back is what clears
	// it: reconfiguring a compartment that keeps the field keeps its contents
	// too, so this has to be two transactions rather than one.
	const servedViewId = useRef(viewId);
	useEffect(() => {
		if (servedViewId.current === viewId) return;
		servedViewId.current = viewId;
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({ effects: historyCompartment.reconfigure([]) });
		view.dispatch({ effects: historyCompartment.reconfigure(history()) });

		// Occurrences were gathered in the format the pane has left, and the
		// ranges CodeMirror maps into the new text no longer mean what the user
		// selected. Ending the multiple selection here is what actually clears
		// the header, rather than hiding a count the editor still holds. The
		// primary range survives whole, so the caret and the text under it stay
		// where a view change has always left them.
		const selection = view.state.selection;
		if (selection.ranges.length > 1) {
			view.dispatch({ selection: EditorSelection.create([selection.main], 0) });
		}
	}, [viewId]);

	// Reconfigure the existing editor rather than remounting it. This keeps the
	// caret, selection, draft, and CodeMirror-local undo history intact.
	useLayoutEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: wrapCompartment.reconfigure(wrapExtension(wrap)),
		});
		view.requestMeasure();
	}, [wrap]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: languageCompartment.reconfigure(languageFor(language)),
		});
	}, [language]);

	// Reconfigured rather than remounted, so switching the preference keeps the
	// caret, the selection, the pane's own wrap choice, and the local undo
	// history exactly where they were.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: indicatorCompartment.reconfigure(
				indicatorExtensions(
					spaceIndicators,
					tabIndicators,
					emptyValueIndicators,
					language,
					fieldSeparator,
				),
			),
		});
	}, [
		spaceIndicators,
		tabIndicators,
		emptyValueIndicators,
		language,
		fieldSeparator,
	]);

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
					contentAttributes(ariaLabel, invalid, describedBy, entered),
				),
			),
		});
	}, [ariaLabel, invalid, describedBy, entered]);

	return <div ref={hostRef} className="h-full min-h-0 [&_.cm-editor]:h-full" />;
}
