import { selectAll } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
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
	IconClipboard,
	IconCopy,
	IconCursorText,
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
import { canRunHistory, runHistory } from "@/history/coordinator";
import { useTabeloStore } from "@/state/store";
import {
	copyToClipboard,
	readTableFromClipboard,
} from "@/ui/clipboard-actions";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import {
	type OccurrenceSummary,
	occurrenceSelectionApplies,
	occurrenceSummary,
	selectNextOccurrenceAsPrimary,
} from "./occurrence-selection";
import {
	type SourceRowRefusal,
	type SourceStructureCommand,
	sourceRowRefusalMessage,
} from "./row-commands";

// The table commands of a pane whose codec maps rows (#255): why each is
// unavailable, read as the menu opens, and the command itself. The row moves
// are the same ones Alt+ArrowUp and Alt+ArrowDown run; the structural
// commands are menu-only.
export interface SourceTableCommands {
	readonly moveRefusal: (offset: number) => SourceRowRefusal | null;
	readonly moveRow: (offset: number) => void;
	readonly refusal: (
		command: SourceStructureCommand,
	) => SourceRowRefusal | null;
	readonly run: (command: SourceStructureCommand) => void;
}

const structureCommands: readonly SourceStructureCommand[] = [
	"move-column-left",
	"move-column-right",
	"insert-row-above",
	"insert-row-below",
	"insert-column-left",
	"insert-column-right",
	"sort-ascending",
	"sort-descending",
	"delete-row",
	"delete-column",
];

type StructureRefusals = Readonly<
	Record<SourceStructureCommand, SourceRowRefusal | null>
>;

// A source pane's own context menu (#234). Its text commands are each a second
// path to a command the editor's keymap already binds, carrying that shortcut,
// so they add reach and never behaviour the keyboard lacks. The table's
// structural commands are the one carved-out group without a binding of their
// own (#255): they are the grid's operations, reached from the text.
//
// Right-click and the keyboard's context-menu gesture (the Menu key, Shift+F10)
// open it. Shift+right-click goes to the browser's own menu instead, because a
// text surface has things there worth keeping: spelling suggestions, look up,
// the browser's text actions. The grid takes the gesture outright because a
// cell offers the browser nothing of the kind. See docs/design-system/9-accessibility.md.

interface MenuState {
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
	// without table commands rather than with disabled ones that never apply.
	readonly table: SourceTableCommands | null;
	// The element the editor mounts into. It becomes the menu's trigger, so the
	// whole editor body opens the menu and nothing outside it does.
	readonly children: ReactElement<{ ref?: RefObject<HTMLDivElement | null> }>;
}) {
	const [state, setState] = useState<MenuState>(closed);
	const hostRef = useRef<HTMLDivElement | null>(null);

	// Shift+right-click reaches the browser's menu. Base UI claims every
	// contextmenu inside its trigger from a document listener, so the event is
	// stopped here, on its way down, before either the trigger or that listener
	// sees it. Only a pointer's: a keyboard-generated one has no pointer type,
	// and Shift+F10 is a request for this menu, not a way around it.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const passThrough = (event: MouseEvent) => {
			const fromPointer =
				event instanceof PointerEvent && event.pointerType !== "";
			if (fromPointer && event.shiftKey) event.stopPropagation();
		};
		host.addEventListener("contextmenu", passThrough, { capture: true });
		return () =>
			host.removeEventListener("contextmenu", passThrough, { capture: true });
	}, []);

	const view = () => viewRef.current;

	// Read once, as the menu opens: the items describe the editor the user
	// right-clicked, not whatever it becomes while the menu is up.
	const snapshot = (): MenuState => {
		const editor = view();
		if (!editor) return closed;
		const store = useTabeloStore.getState();
		return {
			editable: editor.state.facet(EditorView.editable),
			hasSelection: editor.state.selection.ranges.some((range) => !range.empty),
			canOccurrence: occurrenceSelectionApplies(editor.state),
			canUndo: canRunHistory(paneId, "undo", store.past.length > 0),
			canRedo: canRunHistory(paneId, "redo", store.future.length > 0),
			moveUp: table?.moveRefusal(-1) ?? null,
			moveDown: table?.moveRefusal(1) ?? null,
			structure: table
				? (Object.fromEntries(
						structureCommands.map((command) => [
							command,
							table.refusal(command),
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

	const readOnly = state.editable ? undefined : copy.disabled.sourceReadOnly;
	const nothingSelected = state.hasSelection
		? undefined
		: copy.disabled.sourceNothingSelected;

	type Item = {
		readonly id: string;
		readonly label: string;
		readonly icon: typeof IconCopy;
		// Absent only for the structural commands, which have no binding.
		readonly shortcut?: string;
		readonly danger?: boolean;
		readonly reason?: string;
		readonly run: () => void;
	};

	const refused = (refusal: SourceRowRefusal | null | undefined) =>
		readOnly ?? (refusal ? sourceRowRefusalMessage[refusal] : undefined);

	// Row moves first, as the keyboard offers them, then the grid's other
	// structural operations in the grid menu's order: move, insert, sort,
	// delete.
	const tableGroups = (commands: SourceTableCommands): Item[][] => {
		const structural = (
			command: SourceStructureCommand,
			label: string,
			icon: typeof IconCopy,
			danger = false,
		): Item => ({
			id: command,
			label,
			icon,
			danger,
			reason: refused(state.structure?.[command]),
			run: () => commands.run(command),
		});
		return [
			[
				{
					id: "move-row-up",
					label: copy.actions.moveRowUp,
					icon: IconArrowNarrowUp,
					shortcut: copy.shortcuts.moveUp,
					reason: refused(state.moveUp),
					run: () => commands.moveRow(-1),
				},
				{
					id: "move-row-down",
					label: copy.actions.moveRowDown,
					icon: IconArrowNarrowDown,
					shortcut: copy.shortcuts.moveDown,
					reason: refused(state.moveDown),
					run: () => commands.moveRow(1),
				},
				structural(
					"move-column-left",
					copy.actions.moveColumnLeft,
					IconArrowNarrowLeft,
				),
				structural(
					"move-column-right",
					copy.actions.moveColumnRight,
					IconArrowNarrowRight,
				),
			],
			[
				structural(
					"insert-row-above",
					copy.actions.insertRowsAbove(1),
					IconArrowBarToUp,
				),
				structural(
					"insert-row-below",
					copy.actions.insertRowsBelow(1),
					IconArrowBarToDown,
				),
				structural(
					"insert-column-left",
					copy.actions.insertColumnsLeft(1),
					IconArrowBarToLeft,
				),
				structural(
					"insert-column-right",
					copy.actions.insertColumnsRight(1),
					IconArrowBarToRight,
				),
			],
			[
				structural(
					"sort-ascending",
					copy.actions.sortColumnAscending,
					IconSortAscending,
				),
				structural(
					"sort-descending",
					copy.actions.sortColumnDescending,
					IconSortDescending,
				),
			],
			[
				structural("delete-row", copy.actions.deleteRows(1), IconTrash, true),
				structural(
					"delete-column",
					copy.actions.deleteColumns(1),
					IconTrash,
					true,
				),
			],
		];
	};
	const groups: readonly (readonly Item[])[] = [
		[
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
		[
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
		[
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
			{
				id: "next-occurrence",
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
		...(table ? tableGroups(table) : []),
	];

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (open) setState(snapshot());
			}}
		>
			<ContextMenuTrigger render={children} ref={hostRef} />
			{/* Every exit hands focus back to the text, so a second Escape then
			    leaves the pane, as it would from the editor directly. */}
			<ContextMenuContent
				className="w-auto min-w-56"
				finalFocus={() => view()?.contentDOM ?? null}
			>
				{groups.map((items, index) => (
					<Fragment key={items[0]?.id}>
						{index > 0 ? <ContextMenuSeparator /> : null}
						<ContextMenuGroup>
							{items.map((item) => (
								<ControlTooltip key={item.id} reason={item.reason}>
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
							))}
						</ContextMenuGroup>
					</Fragment>
				))}
			</ContextMenuContent>
		</ContextMenu>
	);
}
