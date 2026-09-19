import { selectAll } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@tabelo/ui/components/context-menu";
import {
	IconArrowBackUp,
	IconArrowBarToDown,
	IconArrowBarToLeft,
	IconArrowBarToRight,
	IconArrowBarToUp,
	IconArrowForwardUp,
	IconArrowNarrowDown,
	IconArrowNarrowLeft,
	IconArrowNarrowRight,
	IconArrowNarrowUp,
	IconArrowsMove,
	IconArrowsSort,
	IconClipboard,
	IconCopy,
	IconCursorText,
	IconLayoutColumns,
	IconLayoutRows,
	IconScissors,
	IconSelectAll,
	IconSortAscending,
	IconSortDescending,
	IconTrash,
} from "@tabler/icons-react";
import {
	Fragment,
	type ReactElement,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { copy } from "@/copy/copy";
import { cellText } from "@/core/cell-value";
import type { Alignment, ExpectedColumnType } from "@/core/types";
import { cellAtPosition } from "@/formats/parse";
import { canRunHistory, runHistory } from "@/history/coordinator";
import { useTabeloStore } from "@/state/store";
import {
	copyToClipboard,
	readTableFromClipboard,
} from "@/ui/clipboard-actions";
import {
	ColumnTypeChangeDialog,
	type PendingColumnTypeChange,
} from "@/ui/grid/cell-type-change-dialog";
import {
	ColumnAlignmentGroup,
	ColumnExpectedTypeGroup,
} from "@/ui/grid/grid-context-menu";
import {
	type MenuCommandId,
	type MenuGroupId,
	orderMenuGroups,
} from "@/ui/grid/menu-order";
import { menuSections } from "@/ui/grid/menu-sections";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import {
	type OccurrenceSummary,
	occurrenceSelectionApplies,
	occurrenceSummary,
	selectNextOccurrenceAsPrimary,
} from "./occurrence-selection";
import {
	type SourceCellResolution,
	type SourceRowRefusal,
	type SourceStructureCommand,
	sourceRowRefusalMessage,
} from "./row-commands";
import {
	axisAnchor,
	labelAt,
	type SourceAxis,
	selectAxis,
	selectedSourceAxis,
} from "./source-axes";
import { sourceRowsField } from "./source-rows";

// The table commands of a pane whose codec maps rows (#255): why each is
// unavailable, read as the menu opens, and the command itself. The row moves
// are the same ones Alt+ArrowUp and Alt+ArrowDown run; the rest are
// menu-only. Each names its row or column by an offset in the
// text: the caret's when `at` is absent, or the one a column letter or a line
// number stands for (#395).
export interface SourceTableCommands {
	readonly moveRefusal: (
		offset: number,
		at?: number,
	) => SourceRowRefusal | null;
	readonly moveRow: (offset: number, at?: number) => void;
	readonly refusal: (
		command: SourceStructureCommand,
		at?: number,
	) => SourceRowRefusal | null;
	readonly run: (command: SourceStructureCommand, at?: number) => void;
	// The cell `at` names, or why the text names none: what a column letter's
	// expected type and alignment check before they act.
	readonly cell: (at?: number) => SourceCellResolution;
	// A column letter's two column settings, named by `at`. Setting the expected
	// type returns how many cells cannot follow it, and changes nothing then,
	// so the menu can ask first, as the grid's does (#392).
	readonly setExpectedType: (at: number, next: ExpectedColumnType) => number;
	readonly setAlignment: (at: number, next: Alignment) => void;
	// Whether the format's text spells a column's alignment, as Markdown's
	// divider does; a letter offers alignment only there.
	readonly spellsAlignment: boolean;
}

const structureCommands: readonly SourceStructureCommand[] = [
	"move-column-left",
	"move-column-right",
	"insert-row-above",
	"insert-row-below",
	"duplicate-row",
	"insert-column-left",
	"insert-column-right",
	"sort-ascending",
	"sort-descending",
	"delete-row",
	"delete-column",
];

// Which of a table's axes a menu's commands act on.
interface Axes {
	readonly rows: boolean;
	readonly columns: boolean;
}
const bothAxes: Axes = { rows: true, columns: true };
const rowAxis: Axes = { rows: true, columns: false };
const columnAxis: Axes = { rows: false, columns: true };

type StructureRefusals = Readonly<
	Record<SourceStructureCommand, SourceRowRefusal | null>
>;

// A source pane's own context menu (#234). Its text commands are each a second
// path to a command the editor's keymap already binds, carrying that shortcut,
// so they add reach and never behaviour the keyboard lacks. The table's
// structural commands are the one carved-out group (#255): they are the
// grid's operations, reached from the text, and only the row moves have a
// key. Every menu lists its commands in the order the grid's
// share (menu-order.ts).
//
// Right-click and the keyboard's context-menu gesture (the Menu key, Shift+F10)
// open it. Shift+right-click goes to the browser's own menu instead, because a
// text surface has things there worth keeping: spelling suggestions, look up,
// the browser's text actions. The grid takes the gesture outright because a
// cell offers the browser nothing of the kind. See docs/design-system/9-accessibility.md.

// What the menu was opened on: the text, or a row or column named by its line
// number or letter, or by the selection a keyboard opened it from. `index`
// counts rows the way the mapping does, the header row as 0.
type MenuTarget =
	| { readonly kind: "text" }
	| {
			readonly kind: SourceAxis;
			readonly index: number;
			readonly at: number;
	  };

// The column a letter's menu describes, read as it opens.
interface ColumnFacts {
	readonly header: string;
	readonly expectedType: ExpectedColumnType;
	readonly align?: Alignment;
}

interface MenuState {
	readonly target: MenuTarget;
	readonly column: ColumnFacts | null;
	// Why the cell a letter names cannot be acted on, for its expected type and
	// alignment.
	readonly cellRefusal: SourceRowRefusal | null;
	// Why the caret names no row or no column, for Select row and Select column.
	readonly selectRow: SourceRowRefusal | null;
	readonly selectColumn: SourceRowRefusal | null;
	readonly editable: boolean;
	readonly hasSelection: boolean;
	readonly canOccurrence: boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly moveUp: SourceRowRefusal | null;
	readonly moveDown: SourceRowRefusal | null;
	readonly structure: StructureRefusals | null;
}

const closed: MenuState = {
	target: { kind: "text" },
	column: null,
	cellRefusal: null,
	selectRow: null,
	selectColumn: null,
	editable: false,
	hasSelection: false,
	canOccurrence: false,
	canUndo: false,
	canRedo: false,
	moveUp: null,
	moveDown: null,
	structure: null,
};

// What the selection holds, as the clipboard would receive it: CodeMirror's
// own copy joins several ranges with the document's line break.
function selectedText(view: EditorView): string {
	const { state } = view;
	return state.selection.ranges
		.filter((range) => !range.empty)
		.map((range) => state.sliceDoc(range.from, range.to))
		.join(state.lineBreak);
}

// The row or column the caret is in, as the mapping counts them, for Select
// row and Select column.
function caretAxis(view: EditorView, axis: SourceAxis): number | null {
	const rows = view.state.field(sourceRowsField, false);
	if (!rows) return null;
	const position = cellAtPosition(rows, view.state.selection.main.head);
	if (!position) return null;
	return axis === "row" ? position.row : position.column;
}

type Item = {
	readonly id: MenuCommandId;
	readonly label: string;
	readonly icon: typeof IconCopy;
	// Absent for the commands without a binding of their own.
	readonly shortcut?: string;
	readonly danger?: boolean;
	readonly reason?: string;
	readonly run: () => void;
};

// A group of the order every table menu shares (menu-order.ts). A named group
// of directional commands is shown as one submenu, as the grid's are (#369).
type Group = {
	readonly id: MenuGroupId;
	readonly label?: string;
	readonly submenu?: typeof IconCopy;
	readonly actions: readonly Item[];
};

function MenuItem({ item }: { readonly item: Item }) {
	return (
		<ControlTooltip reason={item.reason}>
			<ContextMenuItem
				disabled={item.reason !== undefined}
				variant={item.danger ? "destructive" : "default"}
				onClick={item.run}
			>
				<item.icon aria-hidden />
				{item.label}
				{item.shortcut ? (
					<ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>
				) : null}
			</ContextMenuItem>
		</ControlTooltip>
	);
}

// Drawn as the grid draws its own: the shared order, a separator between
// sections, and adjacent submenus in one untitled group.
function MenuGroups({
	groups,
	finalFocus,
}: {
	readonly groups: readonly Group[];
	readonly finalFocus: () => HTMLElement | null;
}) {
	return menuSections(orderMenuGroups(groups)).map((section, index) => (
		<Fragment key={section.map((group) => group.id).join("+")}>
			{index > 0 ? <ContextMenuSeparator /> : null}
			{section[0]?.submenu ? (
				<ContextMenuGroup>
					{section.map((group) =>
						group.submenu && group.label ? (
							<ContextMenuSub key={group.id}>
								<ContextMenuSubTrigger>
									<group.submenu aria-hidden />
									{group.label}
								</ContextMenuSubTrigger>
								<ContextMenuSubContent
									aria-label={group.label}
									finalFocus={finalFocus}
								>
									{group.actions.map((item) => (
										<MenuItem key={item.id} item={item} />
									))}
								</ContextMenuSubContent>
							</ContextMenuSub>
						) : null,
					)}
				</ContextMenuGroup>
			) : (
				section.map((group) => (
					<ContextMenuGroup key={group.id} aria-label={group.label}>
						{group.label ? (
							<ContextMenuLabel>{group.label}</ContextMenuLabel>
						) : null}
						{group.actions.map((item) => (
							<MenuItem key={item.id} item={item} />
						))}
					</ContextMenuGroup>
				))
			)}
		</Fragment>
	));
}

export function SourceContextMenu({
	paneId,
	viewRef,
	onOccurrenceAdded,
	table,
	children,
}: {
	readonly paneId: string;
	readonly viewRef: RefObject<EditorView | null>;
	readonly onOccurrenceAdded: (summary: OccurrenceSummary) => void;
	// Absent where the pane's codec cannot name a row, which leaves the menu
	// without table commands rather than with disabled ones that never apply,
	// and the line numbers and letters without menus of their own.
	readonly table: SourceTableCommands | null;
	// The element the editor mounts into. It becomes the menu's trigger, so the
	// whole editor body opens the menu and nothing outside it does.
	readonly children: ReactElement<{ ref?: RefObject<HTMLDivElement | null> }>;
}) {
	const [state, setState] = useState<MenuState>(closed);
	const hostRef = useRef<HTMLDivElement | null>(null);
	// What the event opening the menu named, recorded on its way down, before
	// the menu reads it as it opens.
	const targetRef = useRef<MenuTarget>({ kind: "text" });
	const tableRef = useRef(table);
	tableRef.current = table;
	// An expected type change some cells cannot follow asks first (#392), in
	// the dialog the grid's column menu uses, once this menu has closed.
	const menuDialog = useMenuDialogCommand();
	const [pendingTypeChange, setPendingTypeChange] =
		useState<PendingColumnTypeChange | null>(null);

	// Shift+right-click reaches the browser's menu. Base UI claims every
	// contextmenu inside its trigger from a document listener, so the event is
	// stopped here, on its way down, before either the trigger or that listener
	// sees it. Only a pointer's: a keyboard-generated one has no pointer type,
	// and Shift+F10 is a request for this menu, not a way around it.
	//
	// The same listener decides what the menu is about (#395). A pointer names
	// its own target: a column letter opens its column's menu, the line number
	// of a table row its row's, and a line number that names no row, such as
	// Markdown's divider, offers nothing at all. The keyboard has only the
	// selection, as in the grid: a selected row or column offers its own menu,
	// and anything else the text menu.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		// Chromium reports the keyboard's gesture as a pointer event of the mouse
		// type, with no button, so the keys themselves are what tell it apart.
		let fromKeys = false;
		const onKeyDown = (event: KeyboardEvent) => {
			fromKeys =
				event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
		};
		const onContextMenu = (event: MouseEvent) => {
			const fromPointer =
				!fromKeys &&
				event.button !== -1 &&
				event instanceof PointerEvent &&
				event.pointerType !== "";
			fromKeys = false;
			if (fromPointer && event.shiftKey) {
				event.stopPropagation();
				return;
			}
			targetRef.current = { kind: "text" };
			const editor = viewRef.current;
			if (!editor || !tableRef.current) return;
			if (!fromPointer) {
				const selected = selectedSourceAxis(editor.state);
				const at = selected ? axisAnchor(editor.state, selected) : null;
				if (selected && at !== null) {
					targetRef.current = {
						kind: selected.axis,
						index: selected.index,
						at,
					};
				}
				return;
			}
			const hit = labelAt(editor, event.target, event.clientX, event.clientY);
			if (!hit) return;
			const at =
				hit.kind === "label" ? axisAnchor(editor.state, hit.target) : null;
			if (hit.kind !== "label" || at === null) {
				event.preventDefault();
				event.stopPropagation();
				// The text has no rows the document has read, so nothing can be
				// named, and saying so is the one thing the label can do.
				if (hit.kind === "unmapped") {
					useTabeloStore.getState().pushNotice({
						severity: "warning",
						message: sourceRowRefusalMessage.unparsed,
					});
				}
				return;
			}
			// Opening a menu selects what it acts on, as in the grid, so the
			// highlight and the commands never disagree about their target.
			const selected = selectedSourceAxis(editor.state);
			if (
				selected?.axis !== hit.target.axis ||
				selected.index !== hit.target.index
			) {
				selectAxis(editor, hit.target);
			}
			targetRef.current = {
				kind: hit.target.axis,
				index: hit.target.index,
				at,
			};
		};
		host.addEventListener("keydown", onKeyDown, { capture: true });
		host.addEventListener("contextmenu", onContextMenu, { capture: true });
		return () => {
			host.removeEventListener("keydown", onKeyDown, { capture: true });
			host.removeEventListener("contextmenu", onContextMenu, {
				capture: true,
			});
		};
	}, [viewRef]);

	const view = () => viewRef.current;

	// Read once, as the menu opens: the items describe the editor the user
	// right-clicked, not whatever it becomes while the menu is up.
	const snapshot = (): MenuState => {
		const editor = view();
		if (!editor) return closed;
		const store = useTabeloStore.getState();
		const target = table ? targetRef.current : ({ kind: "text" } as const);
		const at = target.kind === "text" ? undefined : target.at;
		const caretCell = table?.cell();
		const columnFacts = (): ColumnFacts | null => {
			if (target.kind !== "column") return null;
			const column = store.document.columns[target.index];
			return column
				? {
						header: cellText(column.header),
						expectedType: column.expectedType ?? "text",
						align: column.align,
					}
				: null;
		};
		const cellResolution = table?.cell(at);
		return {
			target,
			column: columnFacts(),
			cellRefusal:
				cellResolution && !cellResolution.ok ? cellResolution.refusal : null,
			selectRow: caretCell && !caretCell.ok ? caretCell.refusal : null,
			selectColumn:
				caretCell && !caretCell.ok
					? caretCell.refusal
					: caretCell?.column === null
						? "outside-cell"
						: null,
			editable: editor.state.facet(EditorView.editable),
			hasSelection: editor.state.selection.ranges.some((range) => !range.empty),
			canOccurrence: occurrenceSelectionApplies(editor.state),
			canUndo: canRunHistory(paneId, "undo", store.past.length > 0),
			canRedo: canRunHistory(paneId, "redo", store.future.length > 0),
			moveUp: table?.moveRefusal(-1, at) ?? null,
			moveDown: table?.moveRefusal(1, at) ?? null,
			structure: table
				? (Object.fromEntries(
						structureCommands.map((command) => [
							command,
							table.refusal(command, at),
						]),
					) as StructureRefusals)
				: null,
		};
	};

	const writeSelection = async (cut: boolean) => {
		const editor = view();
		if (!editor) return;
		const text = selectedText(editor);
		if (!text) return;
		const written = await copyToClipboard({ text }, "source");
		if (cut && written) {
			editor.dispatch(editor.state.replaceSelection(""), {
				userEvent: "delete.cut",
			});
		}
	};

	const paste = async () => {
		const payload = await readTableFromClipboard();
		const editor = view();
		if (!payload || !editor) return;
		editor.dispatch(editor.state.replaceSelection(payload.text), {
			userEvent: "input.paste",
			scrollIntoView: true,
		});
	};

	// The same layering as the keymap and the App Menu: the editor's own
	// history first, then the document timeline once it is exhausted.
	const history = (direction: "undo" | "redo") =>
		runHistory(paneId, direction, () => {
			const store = useTabeloStore.getState();
			if (direction === "undo") store.undo();
			else store.redo();
		});

	const nextOccurrence = () => {
		const editor = view();
		if (!editor || !selectNextOccurrenceAsPrimary(editor)) return;
		const summary = occurrenceSummary(editor.state);
		if (summary) onOccurrenceAdded(summary);
	};

	// Select row and Select column: the keyboard's way to what a click on a
	// line number or a letter does, after which the same keys open that row's
	// or column's own menu.
	const selectCaretAxis = (axis: SourceAxis) => {
		const editor = view();
		if (!editor) return;
		const index = caretAxis(editor, axis);
		if (index !== null) selectAxis(editor, { axis, index });
	};

	const readOnly = state.editable ? undefined : copy.disabled.sourceReadOnly;
	const nothingSelected = state.hasSelection
		? undefined
		: copy.disabled.sourceNothingSelected;

	const refused = (refusal: SourceRowRefusal | null | undefined) =>
		readOnly ?? (refusal ? sourceRowRefusalMessage[refusal] : undefined);

	const structural = (
		commands: SourceTableCommands,
		id: MenuCommandId,
		command: SourceStructureCommand,
		label: string,
		icon: typeof IconCopy,
		shortcut?: string,
		danger = false,
	): Item => ({
		id,
		label,
		icon,
		shortcut,
		danger,
		reason: refused(state.structure?.[command]),
		run: () =>
			commands.run(
				command,
				state.target.kind === "text" ? undefined : state.target.at,
			),
	});

	// The table commands. Each menu draws only those its target can take: the
	// text menu all of them, on the caret's row and column; a line number's
	// menu its row's; a letter's menu its column's. Where they sit is the
	// shared order's business, not this list's. `at` names the row a line
	// number opened the menu on, and is absent for the caret.
	const insertItems = (commands: SourceTableCommands, axes: Axes): Item[] => [
		...(axes.rows
			? [
					structural(
						commands,
						"insert-row-above",
						"insert-row-above",
						copy.actions.insertRowsAbove(1),
						IconArrowBarToUp,
					),
					structural(
						commands,
						"insert-row-below",
						"insert-row-below",
						copy.actions.insertRowsBelow(1),
						IconArrowBarToDown,
					),
				]
			: []),
		...(axes.columns
			? [
					structural(
						commands,
						"insert-column-left",
						"insert-column-left",
						copy.actions.insertColumnsLeft(1),
						IconArrowBarToLeft,
					),
					structural(
						commands,
						"insert-column-right",
						"insert-column-right",
						copy.actions.insertColumnsRight(1),
						IconArrowBarToRight,
					),
				]
			: []),
	];

	// Alt+ArrowUp and Alt+ArrowDown move the row in every pane that maps rows,
	// so both carry the grid's legend. A column move has no key in a source
	// view, because Alt+ArrowLeft and Alt+ArrowRight are the editor's word
	// motion on macOS, so those two show none.
	const moveRowItems = (commands: SourceTableCommands, at?: number): Item[] => [
		{
			id: "move-up",
			label: copy.actions.moveUp,
			icon: IconArrowNarrowUp,
			shortcut: copy.shortcuts.moveUp,
			reason: refused(state.moveUp),
			run: () => commands.moveRow(-1, at),
		},
		{
			id: "move-down",
			label: copy.actions.moveDown,
			icon: IconArrowNarrowDown,
			shortcut: copy.shortcuts.moveDown,
			reason: refused(state.moveDown),
			run: () => commands.moveRow(1, at),
		},
	];
	const moveColumnItems = (commands: SourceTableCommands): Item[] => [
		structural(
			commands,
			"move-left",
			"move-column-left",
			copy.actions.moveLeft,
			IconArrowNarrowLeft,
		),
		structural(
			commands,
			"move-right",
			"move-column-right",
			copy.actions.moveRight,
			IconArrowNarrowRight,
		),
	];

	const moveGroup = (actions: readonly Item[]): Group => ({
		id: "move",
		label: copy.actions.move,
		submenu: IconArrowsMove,
		actions,
	});

	const sortGroup = (commands: SourceTableCommands): Group => ({
		id: "sort",
		label: copy.actions.sort,
		submenu: IconArrowsSort,
		actions: [
			structural(
				commands,
				"sort-ascending",
				"sort-ascending",
				copy.actions.sortAscending,
				IconSortAscending,
			),
			structural(
				commands,
				"sort-descending",
				"sort-descending",
				copy.actions.sortDescending,
				IconSortDescending,
			),
		],
	});

	const duplicateGroup = (commands: SourceTableCommands): Group => ({
		id: "edit",
		label: copy.actions.edit,
		actions: [
			structural(
				commands,
				"duplicate",
				"duplicate-row",
				copy.actions.duplicateRows(1),
				IconCopy,
			),
		],
	});

	const removeGroup = (commands: SourceTableCommands, axes: Axes): Group => ({
		id: "remove",
		actions: [
			...(axes.rows
				? [
						structural(
							commands,
							"delete-rows",
							"delete-row",
							copy.actions.deleteRows(1),
							IconTrash,
							undefined,
							true,
						),
					]
				: []),
			...(axes.columns
				? [
						structural(
							commands,
							"delete-columns",
							"delete-column",
							copy.actions.deleteColumns(1),
							IconTrash,
							undefined,
							true,
						),
					]
				: []),
		],
	});

	// The caret's row and column: every table command, beside the text ones.
	const tableGroups = (commands: SourceTableCommands): Group[] => [
		{ id: "insert", actions: insertItems(commands, bothAxes) },
		duplicateGroup(commands),
		moveGroup([...moveRowItems(commands), ...moveColumnItems(commands)]),
		sortGroup(commands),
		removeGroup(commands, bothAxes),
	];

	// A line number's menu: the grid's row menu, less what text cannot hold
	// (the clipboard, which the text menu already has, clearing, filling, and
	// pinning).
	const rowGroups = (commands: SourceTableCommands, at: number): Group[] => [
		{ id: "insert", actions: insertItems(commands, rowAxis) },
		duplicateGroup(commands),
		moveGroup(moveRowItems(commands, at)),
		removeGroup(commands, rowAxis),
	];

	// A letter's menu: the grid's column menu, less its grid-only preferences
	// (width, wrapping, pinning) and what the text menu already has.
	const columnGroups = (commands: SourceTableCommands): Group[] => [
		{ id: "insert", actions: insertItems(commands, columnAxis) },
		moveGroup(moveColumnItems(commands)),
		sortGroup(commands),
		removeGroup(commands, columnAxis),
	];

	// Select row and Select column are the keyboard's way to a row's or a
	// column's own menu, so they exist only where the pane has those menus.
	const selectAxisItems: Item[] = table
		? [
				{
					id: "select-row",
					label: copy.actions.selectRow,
					icon: IconLayoutRows,
					reason: refused(state.selectRow),
					run: () => selectCaretAxis("row"),
				},
				{
					id: "select-column",
					label: copy.actions.selectColumn,
					icon: IconLayoutColumns,
					reason: refused(state.selectColumn),
					run: () => selectCaretAxis("column"),
				},
			]
		: [];

	const textGroups: readonly Group[] = [
		{
			id: "clipboard",
			actions: [
				{
					id: "cut",
					label: copy.actions.cut,
					icon: IconScissors,
					shortcut: copy.shortcuts.cut,
					reason: readOnly ?? nothingSelected,
					run: () => void writeSelection(true),
				},
				{
					id: "copy",
					label: copy.actions.copy,
					icon: IconCopy,
					shortcut: copy.shortcuts.copy,
					reason: nothingSelected,
					run: () => void writeSelection(false),
				},
				{
					id: "paste",
					label: copy.actions.paste,
					icon: IconClipboard,
					shortcut: copy.shortcuts.paste,
					reason: readOnly,
					run: () => void paste(),
				},
			],
		},
		{
			id: "history",
			actions: [
				{
					id: "undo",
					label: copy.actions.undo,
					icon: IconArrowBackUp,
					shortcut: copy.shortcuts.undo,
					reason: state.canUndo ? undefined : copy.disabled.undo,
					run: () => history("undo"),
				},
				{
					id: "redo",
					label: copy.actions.redo,
					icon: IconArrowForwardUp,
					shortcut: copy.shortcuts.redo,
					reason: state.canRedo ? undefined : copy.disabled.redo,
					run: () => history("redo"),
				},
			],
		},
		{
			id: "select",
			actions: [
				{
					id: "select-all",
					label: copy.actions.selectAllText,
					icon: IconSelectAll,
					shortcut: copy.shortcuts.selectAll,
					run: () => {
						const editor = view();
						if (editor) selectAll(editor);
					},
				},
				...selectAxisItems,
				{
					id: "select-next-match",
					label: copy.actions.selectNextOccurrence,
					icon: IconCursorText,
					shortcut: copy.shortcuts.selectNextOccurrence,
					reason:
						readOnly ??
						(state.canOccurrence
							? undefined
							: copy.disabled.sourceNothingSelected),
					run: nextOccurrence,
				},
			],
		},
		...(table ? tableGroups(table) : []),
	];

	const { target } = state;
	const groups =
		table && target.kind === "row"
			? rowGroups(table, target.at)
			: table && target.kind === "column"
				? columnGroups(table)
				: textGroups;

	// A row's and a column's menus are named as the grid's are, so a screen
	// reader hears which row or column they act on.
	const menuLabel =
		target.kind === "row"
			? copy.actions.rowActionsFor(copy.a11y.rowNumber(target.index - 1))
			: target.kind === "column" && state.column
				? copy.actions.columnActionsFor(
						copy.a11y.columnWithExpectedType(
							state.column.header,
							target.index,
							state.column.expectedType,
						),
					)
				: undefined;

	const finalFocus = () => view()?.contentDOM ?? null;
	const columnReason = refused(state.cellRefusal);

	return (
		<>
			<ContextMenu
				open={menuDialog.open}
				onOpenChange={(open) => {
					if (open) setState(snapshot());
					menuDialog.onOpenChange(open);
				}}
				onOpenChangeComplete={menuDialog.onOpenChangeComplete}
			>
				<ContextMenuTrigger render={children} ref={hostRef} />
				{/* Every exit hands focus back to the text, so a second Escape then
				    leaves the pane, as it would from the editor directly. */}
				<ContextMenuContent
					className="w-auto min-w-56"
					finalFocus={finalFocus}
					aria-label={menuLabel}
				>
					{table && target.kind === "column" && state.column ? (
						<>
							<ColumnExpectedTypeGroup
								value={state.column.expectedType}
								reason={columnReason}
								onChange={(next) => {
									const unconverted = table.setExpectedType(target.at, next);
									if (unconverted > 0) {
										menuDialog.runAfterClose(() =>
											setPendingTypeChange({
												column: target.index,
												target: next,
												unconverted,
											}),
										);
									}
								}}
							/>
							{table.spellsAlignment ? (
								<ColumnAlignmentGroup
									align={state.column.align}
									reason={columnReason}
									onChange={(next) => table.setAlignment(target.at, next)}
								/>
							) : null}
							<ContextMenuSeparator />
						</>
					) : null}
					<MenuGroups groups={groups} finalFocus={finalFocus} />
				</ContextMenuContent>
			</ContextMenu>
			<ColumnTypeChangeDialog
				change={pendingTypeChange}
				onCancel={() => setPendingTypeChange(null)}
				onConfirm={(change) => {
					useTabeloStore
						.getState()
						.setColumnExpectedType(
							change.column,
							change.target,
							true,
							"column",
						);
					setPendingTypeChange(null);
				}}
				finalFocus={finalFocus}
			/>
		</>
	);
}
