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
	ClipboardPaste,
	Copy,
	Redo2,
	Scissors,
	TextCursorInput,
	TextSelect,
	Undo2,
} from "lucide-react";
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

// A source pane's own context menu (#234). Every item is a second path to a
// command the editor's keymap already binds, carrying that shortcut, so the
// menu adds reach and never behaviour the keyboard lacks.
//
// Right-click and the keyboard's context-menu gesture (the Menu key, Shift+F10)
// open it. Shift+right-click goes to the browser's own menu instead, because a
// text surface has things there worth keeping: spelling suggestions, look up,
// the browser's text actions. The grid takes the gesture outright because a
// cell offers the browser nothing of the kind. See docs/design-system.md §9.

interface MenuState {
	readonly editable: boolean;
	readonly hasSelection: boolean;
	readonly canOccurrence: boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
}

const closed: MenuState = {
	editable: false,
	hasSelection: false,
	canOccurrence: false,
	canUndo: false,
	canRedo: false,
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
	children,
}: {
	readonly paneId: string;
	readonly viewRef: RefObject<EditorView | null>;
	readonly onOccurrenceAdded: (summary: OccurrenceSummary) => void;
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
		readonly icon: typeof Copy;
		readonly shortcut: string;
		readonly reason?: string;
		readonly run: () => void;
	};
	const groups: readonly (readonly Item[])[] = [
		[
			{
				id: "cut",
				label: copy.actions.cut,
				icon: Scissors,
				shortcut: copy.shortcuts.cut,
				reason: readOnly ?? nothingSelected,
				run: () => void writeSelection(true),
			},
			{
				id: "copy",
				label: copy.actions.copy,
				icon: Copy,
				shortcut: copy.shortcuts.copy,
				reason: nothingSelected,
				run: () => void writeSelection(false),
			},
			{
				id: "paste",
				label: copy.actions.paste,
				icon: ClipboardPaste,
				shortcut: copy.shortcuts.paste,
				reason: readOnly,
				run: () => void paste(),
			},
		],
		[
			{
				id: "undo",
				label: copy.actions.undo,
				icon: Undo2,
				shortcut: copy.shortcuts.undo,
				reason: state.canUndo ? undefined : copy.disabled.undo,
				run: () => history("undo"),
			},
			{
				id: "redo",
				label: copy.actions.redo,
				icon: Redo2,
				shortcut: copy.shortcuts.redo,
				reason: state.canRedo ? undefined : copy.disabled.redo,
				run: () => history("redo"),
			},
		],
		[
			{
				id: "select-all",
				label: copy.actions.selectAllText,
				icon: TextSelect,
				shortcut: copy.shortcuts.selectAll,
				run: () => {
					const editor = view();
					if (editor) selectAll(editor);
				},
			},
			{
				id: "next-occurrence",
				label: copy.actions.selectNextOccurrence,
				icon: TextCursorInput,
				shortcut: copy.shortcuts.selectNextOccurrence,
				reason:
					readOnly ??
					(state.canOccurrence ? undefined : copy.disabled.noOccurrence),
				run: nextOccurrence,
			},
		],
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
										onClick={item.run}
									>
										<item.icon aria-hidden />
										{item.label}
										<ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>
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
