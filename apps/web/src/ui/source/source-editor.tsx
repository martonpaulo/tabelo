import {
	defaultKeymap,
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
import { minimalChange } from "@/formats/minimal-change";
import type {
	SourceFieldRange,
	SourceTableRow,
	StructuralAssistance,
} from "@/formats/types";
import {
	type HistoryDirection,
	notifyLocalHistoryChanged,
	registerLocalHistory,
} from "@/history/coordinator";
import type { SpaceIndicators } from "@/preferences/contract";
import { useTabeloStore } from "@/state/store";
import { usePaneFailure } from "@/ui/workspace/pane-error-boundary";
import { usePaneFind } from "@/ui/workspace/use-pane-find";
import type {
	HighlightLanguage,
	SourceTabBehaviour,
	ViewId,
} from "@/views/types";
import { columnAlignment } from "./column-alignment";
import { columnMarkers, columnMarkersEnabled } from "./column-markers";
import { csvLanguage } from "./csv-language";
import { drawnSelection } from "./drawn-selection";
import { editorFailures } from "./editor-failures";
import { syntaxTheme } from "./editor-theme";
import { emptyValueMarkers, emptyValueSyntax } from "./empty-values";
import { escapeSequenceGlyphs, escapeSyntax } from "./escape-sequences";
import { sourceTabExtension } from "./field-navigation";
import { htmlHeaderCells, htmlLanguage } from "./html-language";
import { jiraLanguage } from "./jira-language";
import { literalLineBreakMarkers } from "./line-break-markers";
import {
	clearLocalHistory,
	type ExternalChangeWatch,
	localHistory,
	resetOnExternalChanges,
} from "./local-history";
import {
	type OccurrenceSummary,
	occurrenceSummary,
	selectNextOccurrenceAsPrimary,
} from "./occurrence-selection";
import { pinnedHeader, pinnedHeaderSetup } from "./pinned-header";
import { recordsLanguage } from "./records-language";
import {
	caretOffset,
	resolveSourceCommand,
	resolveSourceRowMove,
	type SourceCaretTarget,
	type SourceRowTarget,
	type SourceStructureCommand,
	sourceRowRefusalMessage,
} from "./row-commands";
import { SourceContextMenu } from "./source-context-menu";
import { sourceFind } from "./source-find";
import { setSourceRows, sourceRowsField } from "./source-rows";
import { assistanceExtension } from "./structural-assistance";
import { indicatorClasses, spaceScope } from "./whitespace-indicators";

// Marks a transaction as coming from synchronization rather than the user.
// This is the loop guard required by docs/adr/0001: sync-originated changes
// never feed back into the parser, and never enter the local undo history.
const fromSync = Annotation.define<boolean>();

const languageCompartment = new Compartment();
const editableCompartment = new Compartment();
const diagnosticsCompartment = new Compartment();
const attributesCompartment = new Compartment();
const metricsCompartment = new Compartment();
const wrapCompartment = new Compartment();
const indicatorCompartment = new Compartment();
const tabCompartment = new Compartment();
const assistanceCompartment = new Compartment();
const pinnedHeaderCompartment = new Compartment();
const columnMarkersCompartment = new Compartment();

// Everything the editor draws at the pane's scale, the text, the gutter width,
// and the caret, reads `--pane-zoom` from the cascade, and the pane body is the
// only thing that sets it: see docs/design-system/2-tokens.md, "Per-pane content scale".
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

// Whether a text change is the editor's own undo or redo. CodeMirror's history
// marks every transaction it dispatches with one of these user events:
// https://codemirror.net/docs/ref/#state.Transaction^userEvent
function historyDirectionOf(
	transactions: readonly Transaction[],
): HistoryDirection | undefined {
	for (const direction of ["undo", "redo"] as const) {
		if (transactions.some((transaction) => transaction.isUserEvent(direction)))
			return direction;
	}
	return undefined;
}

function metricsSignal(zoom: number): Extension {
	const known = metricsSignals.get(zoom);
	if (known) return known;
	const signal = EditorView.theme({});
	metricsSignals.set(zoom, signal);
	return signal;
}

// CodeMirror holds the text at least as wide as the widest line it has
// measured (`DocView.minWidth`, written as the content's flex basis), so the
// horizontal scroll range does not shrink while a long line scrolls out of the
// drawn viewport. It lets go when that line's text changes, or when the line
// height becomes one it has not measured before, but a return to a zoom level
// it already knows is neither: zooming a pane in and back out kept the wider
// width, which showed as an empty band after the last column (owner,
// 2026-09-19). A zoom step makes every measured width stale, so it is dropped
// here, in the same commit that publishes the new scale: the remembered width,
// and the basis already written from it, since the next measurement reads the
// content's width and would otherwise take the stale basis for a wide line.
// The field is not public API, so it is written only where it exists and has
// the expected type; if a CodeMirror release renames it, this does nothing and
// the band returns, rather than anything breaking.
// https://github.com/codemirror/view/blob/main/src/docview.ts
function forgetMeasuredWidth(view: EditorView) {
	const docView = (view as unknown as { docView?: { minWidth?: unknown } })
		.docView;
	if (!docView || typeof docView.minWidth !== "number") return;
	docView.minWidth = 0;
	view.contentDOM.style.flexBasis = "";
}

function wrapExtension(wrap: boolean) {
	return wrap ? EditorView.lineWrapping : [];
}

// The column markers (#368) show wherever the codec maps the header row's
// cells, wrapped or not (owner, 2026-09-19).
function columnMarkersExtension(mapsHeaderCells: boolean) {
	return columnMarkersEnabled.of(mapsHeaderCells);
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
export interface IndicatorOptions {
	readonly spaces: SpaceIndicators;
	readonly tabs: boolean;
	readonly emptyValues: boolean;
	readonly lineBreaks: boolean;
	// Whether the columns are aligned on screen (#396), already narrowed to the
	// formats that map their rows and do not pad their own text.
	readonly align: boolean;
	readonly language: HighlightLanguage;
	readonly fieldSeparator: string | undefined;
	// The fields of a format that writes a cell's line break as a real newline,
	// which is where the literal break marker goes. Absent for every other
	// format, whose breaks are escape sequences.
	readonly lineBreakFields: SourceFields | undefined;
}

type SourceFields = (text: string) => readonly SourceFieldRange[];

export function indicatorExtensions({
	spaces,
	tabs,
	emptyValues,
	lineBreaks,
	align,
	language,
	fieldSeparator,
	lineBreakFields,
}: IndicatorOptions): Extension {
	const marksWhitespace = tabs || spaces !== "none";
	const syntax = emptyValues
		? emptyValueSyntax(language, fieldSeparator)
		: null;
	// Escape sequences are notation the format wrote, not a display choice, so
	// unlike the three preferences above they are always drawn. A reader who
	// cannot tell `&#32;` from content has no question to answer with a setting.
	const escapes = escapeSyntax(language);
	const classes = indicatorClasses(spaces, tabs);

	return [
		marksWhitespace ? highlightWhitespace() : [],
		spaceScope(spaces),
		syntax ? emptyValueMarkers(syntax) : [],
		escapes ? escapeSequenceGlyphs(escapes, lineBreaks) : [],
		lineBreaks && lineBreakFields
			? literalLineBreakMarkers(lineBreakFields)
			: [],
		align ? columnAlignment({ emptyValues, lineBreaks, escapes }) : [],
		classes ? EditorView.editorAttributes.of({ class: classes }) : [],
	];
}

// What the pinned header's copy shares with the editor (#252), so it renders the
// header exactly as the editor does: the same grammar, markers, and wrapping,
// and the same zoom signal to remeasure with.
function pinnedHeaderExtension(
	language: HighlightLanguage,
	wrap: boolean,
	zoom: number,
	indicators: Extension,
): Extension {
	return pinnedHeaderSetup.of([
		languageFor(language),
		indicators,
		wrapExtension(wrap),
		metricsSignal(zoom),
	]);
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
export function languageFor(language: HighlightLanguage) {
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

// The fields are read through the handler ref at the moment Tab is pressed, so
// the extension only changes when the behaviour does.
function tabExtension(
	behaviour: SourceTabBehaviour | null,
	handlers: {
		readonly current: {
			readonly sourceFields?: (text: string) => readonly SourceFieldRange[];
		};
	},
): Extension {
	return Prec.high(
		sourceTabExtension(behaviour, () => handlers.current.sourceFields),
	);
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
	// What Tab does here, from the view registry, and the fields the format's
	// grammar finds in the text, for the views that move between fields (#54).
	readonly tabBehaviour: SourceTabBehaviour | null;
	readonly sourceFields?: (text: string) => readonly SourceFieldRange[];
	// The format's structural assistance, and whether the pane currently has it
	// switched on. Absent means the format has none.
	readonly structuralAssistance?: StructuralAssistance;
	readonly assistanceEnabled: boolean;
	// Called when text arrives from outside the editor, replacing the buffer the
	// user was editing: synchronization, a document undo, a view change.
	readonly onBufferReplaced: () => void;
	// The global display preferences from #93, and the separator this
	// view's format writes, which is what tells the empty-value marker where a
	// field ends. All of them are read here rather than stored: no pane owns
	// any of them.
	readonly spaceIndicators: SpaceIndicators;
	readonly tabIndicators: boolean;
	readonly emptyValueIndicators: boolean;
	readonly lineBreakIndicators: boolean;
	// Column alignment (#396), resolved and narrowed to the formats it applies to.
	readonly alignColumns: boolean;
	readonly fieldSeparator?: string;
	// The fields a literal line break is marked inside, for the formats that
	// write a cell's break as a real newline (`literalLineBreaks`).
	readonly lineBreakFields?: SourceFields;
	readonly diagnostics: readonly SourceDiagnostic[];
	// Where the table's rows sit in `value`, for the boundaries between them
	// (#296). Empty when the text does not parse or the format cannot map rows.
	readonly rows: readonly SourceTableRow[];
	// Whether the codec maps where the header row's cells sit, which is what
	// lets the pane label its columns with letters (#368).
	readonly mapsHeaderCells: boolean;
	// The codec whose position mapping names the table row under the caret,
	// when this pane runs row commands (#255). Absent for a format that cannot
	// map rows and for a read-only view, where Alt+ArrowUp and Alt+ArrowDown
	// keep CodeMirror's own line move.
	readonly rowTarget: SourceRowTarget | null;
	readonly invalid: boolean;
	readonly entered: boolean;
	readonly describedBy?: string;
	// Read-only views still get selection and copy, just no typing.
	readonly editable: boolean;
	readonly ariaLabel: string;
	// `history` is set when the change is the editor's own undo or redo, which
	// the document timeline treats as navigation rather than a new edit.
	readonly onChange: (value: string, history?: HistoryDirection) => void;
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
	tabBehaviour,
	sourceFields,
	structuralAssistance,
	assistanceEnabled,
	onBufferReplaced,
	spaceIndicators,
	tabIndicators,
	emptyValueIndicators,
	lineBreakIndicators,
	alignColumns,
	fieldSeparator,
	lineBreakFields,
	diagnostics,
	rows,
	mapsHeaderCells,
	rowTarget,
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
		sourceFields,
		rowTarget,
		onChange,
		onBufferReplaced,
		onUndoBeyondLocal,
		onRedoBeyondLocal,
		onOccurrencesChange,
		onOccurrenceAdded,
	});
	handlers.current = {
		sourceFields,
		rowTarget,
		onChange,
		onBufferReplaced,
		onUndoBeyondLocal,
		onRedoBeyondLocal,
		onOccurrencesChange,
		onOccurrenceAdded,
	};

	// The pane's find bar (#280), read through a ref for the same reason as the
	// handlers above: the editor is built once and must not close over a stale
	// pane.
	const paneFind = usePaneFind();
	const paneFindRef = useRef(paneFind);
	paneFindRef.current = paneFind;

	// Where an exception inside the editor goes: the pane's failure state,
	// read through a ref like the find bar above.
	const paneFailure = usePaneFailure();
	const paneFailureRef = useRef(paneFailure);
	paneFailureRef.current = paneFailure;

	// Where the caret goes once a row command's result is back in the text. Set
	// before the document changes, and spent by the first rows mapped after it.
	const pendingCaret = useRef<SourceCaretTarget | null>(null);

	// Moves the table row under the caret (#255). Reads only refs, so the keymap
	// built once at mount and the context menu share it. False means this pane
	// has no row commands, which hands the key to CodeMirror's line move.
	//
	// The move is a document step, not a keystroke, so like any change from
	// outside this editor's typing it clears the local history (local-history.ts),
	// and the next undo in this pane reverses the move rather than older typing.
	const moveRow = (view: EditorView, offset: number): boolean => {
		const target = handlers.current.rowTarget;
		if (!target) return false;
		const store = useTabeloStore.getState();
		const move = resolveSourceRowMove(view.state, target, offset);
		if (move.ok) pendingCaret.current = move.caret;
		const refusal = move.ok ? store.moveRowAt(move.row, offset) : move.refusal;
		if (refusal) {
			pendingCaret.current = null;
			store.pushNotice({
				severity: "warning",
				message: sourceRowRefusalMessage[refusal],
			});
		}
		return true;
	};

	// The menu-only structural commands (#255), on the same terms as a row move:
	// one document step, which clears the pane's keystroke history like any
	// change from outside its typing (local-history.ts), and the caret carried into the cell the command leaves it in. The caret target is
	// known only once the command has run (a sort decides where the row goes),
	// which is still before React renders the regenerated text that spends it.
	const runStructure = (view: EditorView, command: SourceStructureCommand) => {
		const target = handlers.current.rowTarget;
		if (!target) return;
		const store = useTabeloStore.getState();
		const plan = resolveSourceCommand(view.state, target, command);
		if (!plan.ok) {
			store.pushNotice({
				severity: "warning",
				message: sourceRowRefusalMessage[plan.refusal],
			});
			return;
		}
		const caret = plan.run();
		if (!caret) return;
		pendingCaret.current = caret;
	};

	// The editor is created once and lives for the panel's lifetime. Re-running
	// this on a prop change would tear down CodeMirror and take the undo history
	// and caret with it; the values it closes over are applied by the effects
	// below instead.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		// Set once the editor exists: it is what tells this editor's own reports
		// apart from every other change to the document.
		let externalChanges: ExternalChangeWatch | null = null;
		const failures = editorFailures(() => paneFailureRef.current);
		const view = new EditorView({
			parent: host,
			dispatchTransactions: failures.dispatchTransactions,
			state: EditorState.create({
				doc: value,
				extensions: [
					failures.extension,
					lineNumbers(),
					localHistory(),
					// Without this, every range CodeMirror adds collapses back to one.
					// It is what makes Mod+D, and editing all of its ranges through a
					// single transaction, possible at all.
					EditorState.allowMultipleSelections.of(true),
					drawSelection(),
					drawnSelection,
					highlightActiveLine(),
					highlightActiveLineGutter(),
					wrapCompartment.of(wrapExtension(wrap)),
					indicatorCompartment.of(
						indicatorExtensions({
							spaces: spaceIndicators,
							tabs: tabIndicators,
							emptyValues: emptyValueIndicators,
							lineBreaks: lineBreakIndicators,
							align: alignColumns,
							language,
							fieldSeparator,
							lineBreakFields,
						}),
					),
					languageCompartment.of(languageFor(language)),
					// Above the default keymap, which would otherwise take Enter.
					tabCompartment.of(tabExtension(tabBehaviour, handlers)),
					assistanceCompartment.of(
						assistanceExtension(structuralAssistance, assistanceEnabled),
					),
					diagnosticsCompartment.of(diagnosticExtension(diagnostics)),
					editableCompartment.of(EditorView.editable.of(editable)),
					syntaxTheme,
					sourceFind(() => paneFindRef.current),
					sourceRowsField,
					pinnedHeader,
					columnMarkers,
					columnMarkersCompartment.of(columnMarkersExtension(mapsHeaderCells)),
					pinnedHeaderCompartment.of(
						pinnedHeaderExtension(
							language,
							wrap,
							zoom,
							indicatorExtensions({
								spaces: spaceIndicators,
								tabs: tabIndicators,
								emptyValues: emptyValueIndicators,
								lineBreaks: lineBreakIndicators,
								align: alignColumns,
								language,
								fieldSeparator,
								lineBreakFields,
							}),
						),
					),
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
								// Mod+D belongs to a focused, editable source editor
								// outright, including when there is no occurrence to add:
								// a key whose outcome depended on an invisible condition
								// would bookmark the page one press and select text the
								// next. A read-only view has no claim on it, so it returns
								// false and the browser keeps its own Mod+D there. Escape
								// leaves the pane, which is how the bookmark shortcut stays
								// reachable. See docs/design-system/9-accessibility.md.
								key: "Mod-d",
								run: (target) => {
									if (!target.state.facet(EditorView.editable)) return false;
									if (!selectNextOccurrenceAsPrimary(target)) return true;
									const summary = occurrenceSummary(target.state);
									if (summary) handlers.current.onOccurrenceAdded(summary);
									return true;
								},
							},
							// In a pane whose codec maps rows, Alt+ArrowUp and
							// Alt+ArrowDown move the table row, as in the grid (owner,
							// 2026-09-18, #255). Everywhere else they return false and
							// the default keymap below moves the text line.
							{ key: "Alt-ArrowUp", run: (target) => moveRow(target, -1) },
							{ key: "Alt-ArrowDown", run: (target) => moveRow(target, 1) },
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
					keymap.of([
						...defaultKeymap,
						...historyKeymap,
						// CodeMirror leaves Tab unbound so focus can escape, but a
						// source view's exit is Escape, and a Tab that left the pane
						// mid-typing is the one thing a table editor must not do. A view
						// whose behaviour did not take the key still keeps it here.
						// See docs/design-system/9-accessibility.md, "The source-editor keyboard model".
						{ key: "Tab", run: () => true, shift: () => true },
					]),

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
						const text = update.state.doc.toString();
						const direction = historyDirectionOf(update.transactions);
						externalChanges?.own(() =>
							handlers.current.onChange(text, direction),
						);
					}),
				],
			}),
		});

		viewRef.current = view;
		externalChanges = resetOnExternalChanges(view);
		// Mount before paint and measure once the editor is attached. Source panes
		// can appear as a dialog closes or a layout changes, and waiting for focus
		// would leave wrapped line numbers positioned from stale geometry.
		view.requestMeasure();
		// Until that measure runs, the height map holds CodeMirror's default
		// estimate of a line, well short of the theme's line box, so the gutter
		// stacks its numbers at the top while the text already sits on its real
		// lines. A scheduled measure waits for the next animation frame, and a
		// frame can be painted before it. Reading a line block runs the pending
		// measure now (CodeMirror's `readMeasured`), in this commit, so the first
		// frame that shows the editor already has its numbers on their lines.
		view.lineBlockAtHeight(0);
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
			externalChanges?.dispose();
			externalChanges = null;
			geometryObserver.disconnect();
			unregisterHistory();
			view.destroy();
			viewRef.current = null;
		};
		// Intentionally empty: the editor instance outlives prop changes, which
		// are applied through the effects below.
	}, []);

	// Push external text in without disturbing the caret. The text never enters
	// the local history, and a document change behind it has already cleared
	// that history (local-history.ts).
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const change = minimalChange(view.state.doc.toString(), value);
		if (!change) return;
		view.dispatch({
			changes: change,
			annotations: [fromSync.of(true), Transaction.addToHistory.of(false)],
		});
		handlers.current.onBufferReplaced();
	}, [value]);

	// After the text above, so the rows always describe the text the editor now
	// holds; the field refuses rows parsed from any other text.
	// A row command's caret lands here, in the rows mapped from the text the
	// command regenerated, so it follows the moved row into its new place.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const pending = pendingCaret.current;
		pendingCaret.current = null;
		const caret = pending ? caretOffset(rows, pending) : null;
		view.dispatch({
			effects: setSourceRows.of({ rows, length: value.length }),
			...(caret === null
				? {}
				: { selection: { anchor: caret }, scrollIntoView: true }),
		});
	}, [rows, value]);

	// Marking the cached metrics stale in the commit that publishes the new scale
	// has CodeMirror remeasure before that frame is painted, so the line numbers
	// and the caret land with the resized text rather than settling after it.
	useLayoutEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		forgetMeasuredWidth(view);
		view.dispatch({
			effects: metricsCompartment.reconfigure(metricsSignal(zoom)),
		});
	}, [zoom]);

	// A view change reuses this editor, so its local history would otherwise
	// still describe text in the format the pane has left. Undo has to stop at
	// the switch and fall through to the document timeline from there, per
	// docs/adr/0003.
	const servedViewId = useRef(viewId);
	useEffect(() => {
		if (servedViewId.current === viewId) return;
		servedViewId.current = viewId;
		const view = viewRef.current;
		if (!view) return;
		clearLocalHistory(view);

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

	useLayoutEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: columnMarkersCompartment.reconfigure(
				columnMarkersExtension(mapsHeaderCells),
			),
		});
	}, [mapsHeaderCells]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: languageCompartment.reconfigure(languageFor(language)),
		});
	}, [language]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: tabCompartment.reconfigure(tabExtension(tabBehaviour, handlers)),
		});
	}, [tabBehaviour]);

	// Switching assistance off or on changes no text and records no history: the
	// transaction carries only the reconfiguration. Turning it back on rewrites
	// nothing by itself; the next eligible edit is the first one adjusted.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: assistanceCompartment.reconfigure(
				assistanceExtension(structuralAssistance, assistanceEnabled),
			),
		});
	}, [structuralAssistance, assistanceEnabled]);

	// Reconfigured rather than remounted, so switching the preference keeps the
	// caret, the selection, the pane's own wrap choice, and the local undo
	// history exactly where they were.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: indicatorCompartment.reconfigure(
				indicatorExtensions({
					spaces: spaceIndicators,
					tabs: tabIndicators,
					emptyValues: emptyValueIndicators,
					lineBreaks: lineBreakIndicators,
					align: alignColumns,
					language,
					fieldSeparator,
					lineBreakFields,
				}),
			),
		});
	}, [
		spaceIndicators,
		tabIndicators,
		emptyValueIndicators,
		lineBreakIndicators,
		alignColumns,
		language,
		fieldSeparator,
		lineBreakFields,
	]);

	// The pinned header follows every setting that changes how the header is
	// drawn. A layout effect, like the zoom and wrap ones above, so the copy is
	// remeasured in the same frame as the editor rather than one frame late.
	useLayoutEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: pinnedHeaderCompartment.reconfigure(
				pinnedHeaderExtension(
					language,
					wrap,
					zoom,
					indicatorExtensions({
						spaces: spaceIndicators,
						tabs: tabIndicators,
						emptyValues: emptyValueIndicators,
						lineBreaks: lineBreakIndicators,
						align: alignColumns,
						language,
						fieldSeparator,
						lineBreakFields,
					}),
				),
			),
		});
	}, [
		language,
		wrap,
		zoom,
		spaceIndicators,
		tabIndicators,
		emptyValueIndicators,
		lineBreakIndicators,
		alignColumns,
		fieldSeparator,
		lineBreakFields,
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

	return (
		<SourceContextMenu
			paneId={paneId}
			viewRef={viewRef}
			onOccurrenceAdded={(summary) =>
				handlers.current.onOccurrenceAdded(summary)
			}
			table={
				rowTarget
					? {
							moveRefusal: (offset) => {
								const view = viewRef.current;
								if (!view) return "unparsed";
								const move = resolveSourceRowMove(
									view.state,
									rowTarget,
									offset,
								);
								return move.ok ? null : move.refusal;
							},
							moveRow: (offset) => {
								const view = viewRef.current;
								if (view) moveRow(view, offset);
							},
							refusal: (command) => {
								const view = viewRef.current;
								if (!view) return "unparsed";
								const plan = resolveSourceCommand(
									view.state,
									rowTarget,
									command,
								);
								return plan.ok ? null : plan.refusal;
							},
							run: (command) => {
								const view = viewRef.current;
								if (view) runStructure(view, command);
							},
						}
					: null
			}
		>
			<div ref={hostRef} className="h-full min-h-0 [&_.cm-editor]:h-full" />
		</SourceContextMenu>
	);
}
