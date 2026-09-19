import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@tabelo/ui/components/context-menu";
import { cn } from "@tabelo/ui/lib/utils";
import { IconPhotoOff } from "@tabler/icons-react";
import { useLayoutEffect, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import {
	applyLink,
	imageAt,
	insertImage,
	linkDraft,
	linkRange,
	removeImage,
} from "@/core/cell-formatting";
import { cellText } from "@/core/cell-value";
import {
	INLINE_MARKS,
	inlineLength,
	inlineLinks,
	markState,
	removeLink,
	replaceRange,
	setMark,
	sliceInline,
	snapInlineRange,
	toggleMark,
} from "@/core/inline-content";
import type { InlineMark, TextContent } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { InlineContentView } from "@/ui/inline/inline-content";
import { openLink } from "@/ui/inline/url-policy";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import {
	type CellEditMode,
	type EditorExit,
	wrappedLinesClass,
} from "./cell-editor";
import { offsetAt, pointAt, renderEditorContent } from "./editor-dom";
import { isLinkKey, markForKey, markLabel } from "./format-commands";
import {
	type FormatMarkControl,
	FormatMenuGroup,
	markChecked,
} from "./format-menu-group";
import type { ImageRequest, LinkRequest } from "./inline-dialogs";

// The restricted, single-cell rich editor of the Visual Table (#306). It edits
// one textual cell or header on the browser's own editing surface: a native
// `contenteditable`, the Selection API, and `beforeinput`, with no
// `execCommand` and no rich-text library. Every input is taken over before
// the browser applies it and turned into one of the core's range operations,
// so the table document's model is the only model: the editor keeps the
// content being edited, its selection as projection offsets, the marks a
// collapsed caret will type with, and its own keystroke-level undo, and hands
// the result back on commit exactly as the textarea it replaces did. Enter,
// Shift+Enter, Tab, Escape, F2, and the arrows keep the textarea's meanings.
// See docs/adr/0011.

interface EditorSelection {
	readonly anchor: number;
	readonly focus: number;
}

interface Snapshot extends EditorSelection {
	readonly content: TextContent;
}

const arrowExits: Partial<Record<string, EditorExit>> = {
	ArrowUp: "previous-row",
	ArrowDown: "next-row",
	ArrowLeft: "previous-column",
	ArrowRight: "next-column",
};

const formatInputs: Partial<Record<string, InlineMark>> = {
	formatBold: "bold",
	formatItalic: "italic",
	formatUnderline: "underline",
	formatStrikeThrough: "strikethrough",
};

const stopReactPropagation = (event: { stopPropagation: () => void }) =>
	event.stopPropagation();

function ordered(selection: EditorSelection): readonly [number, number] {
	return [
		Math.min(selection.anchor, selection.focus),
		Math.max(selection.anchor, selection.focus),
	];
}

// The marks typing at a caret continues: those of the text just before it.
function caretMarks(content: TextContent, at: number): InlineMark[] {
	return INLINE_MARKS.filter(
		(mark) => markState(content, at, at, mark) === "on",
	);
}

// Gives a stretch exactly these marks, whatever it had.
function withMarks(
	content: TextContent,
	start: number,
	end: number,
	marks: readonly InlineMark[],
): TextContent {
	let next = content;
	if (!marks.includes("code")) next = setMark(next, start, end, "code", false);
	for (const mark of INLINE_MARKS) {
		if (mark !== "code") {
			next = setMark(next, start, end, mark, marks.includes(mark));
		}
	}
	if (marks.includes("code")) next = setMark(next, start, end, "code", true);
	return next;
}

function toggledMarks(
	marks: readonly InlineMark[],
	mark: InlineMark,
): InlineMark[] {
	if (marks.includes(mark)) return marks.filter((each) => each !== mark);
	// Code takes no other mark, and no other mark goes with code.
	if (mark === "code") return ["code"];
	return [...marks.filter((each) => each !== "code"), mark];
}

interface RichCellEditorProps {
	readonly initialValue: TextContent;
	readonly align: string;
	readonly ariaLabel: string;
	readonly wrapped?: boolean;
	readonly initialMode?: CellEditMode;
	readonly onFinish: (value: TextContent, exit: EditorExit) => void;
	// Mod+K: the link dialog for the selected text, whose answer comes back to
	// this editor rather than to the document.
	readonly onRequestLink: (request: LinkRequest) => void;
	// Image… in the editor's menu: the image dialog, answered the same way.
	readonly onRequestImage: (request: ImageRequest) => void;
}

export function RichCellEditor({
	initialValue,
	align,
	ariaLabel,
	wrapped = false,
	initialMode = "edit",
	onFinish,
	onRequestLink,
	onRequestImage,
}: RichCellEditorProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const iconRef = useRef<HTMLSpanElement>(null);
	const [mode, setMode] = useState<CellEditMode>(initialMode);
	// Only a wrapped column reads this: its row takes its height from an
	// invisible copy of the content in the cell's flow.
	const [sizer, setSizer] = useState<TextContent>(initialValue);

	const end = inlineLength(initialValue);
	const model = useRef<Snapshot>({
		content: initialValue,
		anchor: end,
		focus: end,
	});
	// The selection this editor last placed itself, so a selectionchange it
	// caused is told apart from one the user made.
	const placed = useRef<EditorSelection>({ anchor: end, focus: end });
	// Marks toggled at a collapsed caret, for the text typed next.
	const pendingMarks = useRef<InlineMark[] | null>(null);
	const undoStack = useRef<Snapshot[]>([]);
	const redoStack = useRef<Snapshot[]>([]);
	// Consecutive typing is one undo step, as in a text field.
	const lastEdit = useRef<"typing" | "other" | null>(null);
	const composing = useRef<EditorSelection | null>(null);
	// Set while a dialog this editor opened holds focus, so leaving for it is
	// not a commit.
	const suspended = useRef(false);
	const finished = useRef(false);
	// The editor's own menu (#398), and the range it was opened on, read when
	// it opened because the menu holds focus while it is open.
	const menu = useMenuDialogCommand();
	const menuSelection = useRef<EditorSelection>(model.current);
	// Set from a dialog request until that dialog hands focus back, so focus
	// passing through the editor on its way to the dialog, as it does when the
	// menu closes first, does not lift the suspension.
	const dialogOpen = useRef(false);

	// Where a dialog this editor opened hands focus back as it closes, however
	// it closed; from here the focus handler lifts the suspension.
	const dialogFocus = () => {
		dialogOpen.current = false;
		return rootRef.current;
	};

	const draw = () => {
		const root = rootRef.current;
		if (!root) return;
		renderEditorContent(root, model.current.content, {
			wrapped,
			icon: () => iconRef.current?.firstElementChild?.cloneNode(true) ?? null,
		});
		if (wrapped) setSizer(model.current.content);
	};

	const placeSelection = () => {
		const root = rootRef.current;
		const selection = window.getSelection();
		if (!root || !selection) return;
		// A selection placed in an editor that does not hold focus would pull
		// focus back from a dialog; the focus handler places it on return.
		if (root.ownerDocument.activeElement !== root) return;
		const anchor = pointAt(root, model.current.anchor);
		const focus = pointAt(root, model.current.focus);
		selection.setBaseAndExtent(
			anchor.node,
			anchor.offset,
			focus.node,
			focus.offset,
		);
		placed.current = {
			anchor: model.current.anchor,
			focus: model.current.focus,
		};
	};

	const readSelection = (): EditorSelection => {
		const root = rootRef.current;
		const selection = window.getSelection();
		if (
			!root ||
			!selection?.anchorNode ||
			!selection.focusNode ||
			!root.contains(selection.anchorNode) ||
			!root.contains(selection.focusNode)
		) {
			return model.current;
		}
		return {
			anchor: offsetAt(root, selection.anchorNode, selection.anchorOffset),
			focus: offsetAt(root, selection.focusNode, selection.focusOffset),
		};
	};

	const commitEdit = (
		content: TextContent,
		selection: EditorSelection,
		kind: "typing" | "other",
	) => {
		const current = model.current;
		if (!(kind === "typing" && lastEdit.current === "typing")) {
			undoStack.current.push(current);
		}
		redoStack.current = [];
		lastEdit.current = kind;
		model.current = { content, ...selection };
		draw();
		placeSelection();
	};

	const insertText = (text: string, range?: readonly [number, number]) => {
		const { content } = model.current;
		const [from, to] = range ?? ordered(readSelection());
		const collapsed = from === to;
		let next = replaceRange(content, from, to, text);
		const [start] = snapInlineRange(content, from, to);
		if (collapsed) {
			next = withMarks(
				next,
				start,
				start + text.length,
				pendingMarks.current ?? caretMarks(content, from),
			);
		}
		pendingMarks.current = null;
		const caret = start + text.length;
		commitEdit(next, { anchor: caret, focus: caret }, "typing");
	};

	const deleteRange = (from: number, to: number) => {
		const { content } = model.current;
		const [start, stop] = snapInlineRange(content, from, to);
		if (start === stop) return;
		pendingMarks.current = null;
		commitEdit(
			replaceRange(content, start, stop, ""),
			{ anchor: start, focus: start },
			"other",
		);
	};

	const announce = (message: string) =>
		useTabeloStore.getState().announceStatus(message);

	const toggle = (mark: InlineMark, selection = readSelection()) => {
		const [from, to] = ordered(selection);
		const { content } = model.current;
		if (from === to) {
			const marks = toggledMarks(
				pendingMarks.current ?? caretMarks(content, from),
				mark,
			);
			pendingMarks.current = marks;
			// The caret these marks belong to is the one just read. Its own
			// selectionchange can still be queued behind this key, because the
			// browser moves the caret at once but reports it later, and it must
			// not read as the user moving away and drop the marks.
			placed.current = selection;
			announce(
				copy.status.formatApplied(markLabel(mark), marks.includes(mark)),
			);
			return;
		}
		const state = markState(content, from, to, mark);
		if (state === "unavailable") {
			announce(copy.disabled.formatUnavailable);
			return;
		}
		commitEdit(toggleMark(content, from, to, mark), selection, "other");
		announce(copy.status.formatApplied(markLabel(mark), state !== "on"));
	};

	const history = (direction: "undo" | "redo") => {
		const from = direction === "undo" ? undoStack : redoStack;
		const to = direction === "undo" ? redoStack : undoStack;
		const snapshot = from.current.pop();
		// Exhausted: the edit is still open, so the document timeline is not
		// reached from here; committing or cancelling is the way back to it.
		if (!snapshot) return;
		to.current.push(model.current);
		model.current = snapshot;
		lastEdit.current = null;
		pendingMarks.current = null;
		draw();
		placeSelection();
	};

	const requestLink = (selection = readSelection()) => {
		const [from, to] = ordered(selection);
		const { content } = model.current;
		const draft = linkDraft(content, from, to);
		if (draft.holdsImage) {
			useTabeloStore.getState().pushNotice({
				severity: "warning",
				message: copy.disabled.linkAroundImage,
			});
			return;
		}
		suspended.current = true;
		dialogOpen.current = true;
		onRequestLink({
			draft,
			onSave: (text, url) => {
				const current = model.current.content;
				const next = applyLink(current, from, to, text, url);
				if (next === null) return;
				const [start] = linkRange(current, from, to);
				const caret = start + text.length;
				commitEdit(next, { anchor: caret, focus: caret }, "other");
			},
			onRemove: () =>
				commitEdit(
					removeLink(model.current.content, from, to),
					selection,
					"other",
				),
			finalFocus: dialogFocus,
		});
	};

	// Image… from the editor's menu: the image the range or the caret is on is
	// edited or removed, and otherwise a new one goes in place of the range, at
	// the caret when it is collapsed (#398, #399).
	const requestImage = (selection: EditorSelection) => {
		const [from, to] = ordered(selection);
		const image = imageAt(model.current.content, from, to);
		const [start, stop] = image ? [image.start, image.end] : [from, to];
		suspended.current = true;
		dialogOpen.current = true;
		onRequestImage({
			image: image && { url: image.url, alt: image.alt },
			onSave: (url, alt) => {
				const current = model.current.content;
				const next = insertImage(current, start, stop, url, alt);
				if (next === null) return;
				const [at] = snapInlineRange(current, start, stop);
				const caret = at + alt.length;
				commitEdit(next, { anchor: caret, focus: caret }, "other");
			},
			onRemove: () => {
				if (!image) return;
				commitEdit(
					removeImage(model.current.content, image),
					{ anchor: image.start, focus: image.start },
					"other",
				);
			},
			finalFocus: dialogFocus,
		});
	};

	// Link… and Image… open their dialog once the menu has closed, on the
	// range the menu was opened on.
	const runDialogCommand = (command: (selection: EditorSelection) => void) => {
		menu.runAfterClose(() => command(menuSelection.current));
	};

	// What each Format segment of the editor's menu reads: the marks of the
	// selected range, or at a collapsed caret the marks typing will use.
	const menuMarkControl = (mark: InlineMark): FormatMarkControl => {
		const [from, to] = ordered(menuSelection.current);
		const { content } = model.current;
		if (from === to) {
			const marks = pendingMarks.current ?? caretMarks(content, from);
			return {
				checked: marks.includes(mark) ? "true" : "false",
				refusal: undefined,
			};
		}
		const state = markState(content, from, to, mark);
		return {
			checked: markChecked(state),
			refusal:
				state === "unavailable" ? copy.disabled.formatUnavailable : undefined,
		};
	};

	const menuLinkRefusal = () => {
		const [from, to] = ordered(menuSelection.current);
		return linkDraft(model.current.content, from, to).holdsImage
			? copy.disabled.linkAroundImage
			: undefined;
	};

	// The keyboard's way to the editor's menu, Shift+F10 or the ContextMenu
	// key: a `contextmenu` event on the editor, anchored under the caret, so
	// the pointer's path is reused rather than repeated.
	const openMenuFromKeyboard = () => {
		const root = rootRef.current;
		if (!root) return;
		let box = root.getBoundingClientRect();
		const selection = window.getSelection();
		if (selection?.rangeCount && root.contains(selection.focusNode)) {
			const caret = selection.getRangeAt(0).getBoundingClientRect();
			if (caret.width > 0 || caret.height > 0) box = caret;
		}
		root.dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				cancelable: true,
				button: 2,
				clientX: box.left,
				clientY: box.bottom,
			}),
		);
	};

	const openLinkAtCaret = () => {
		const [from, to] = ordered(readSelection());
		const link = inlineLinks(model.current.content).find(
			(each) => each.start <= from && to <= each.end && each.start < each.end,
		);
		if (!link) {
			announce(copy.status.noLinkHere);
			return;
		}
		if (!openLink(link.url)) announce(copy.status.linkNotOpened);
	};

	const finish = (exit: EditorExit) => {
		if (finished.current) return;
		finished.current = true;
		onFinish(model.current.content, exit);
	};

	// The content, focus, and the caret at the end, as the textarea did; then
	// the native listeners React has no typed equivalent for.
	// biome-ignore lint/correctness/useExhaustiveDependencies: mounted once; the handlers read refs
	useLayoutEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		draw();
		root.focus();
		placeSelection();

		const onBeforeInput = (event: InputEvent) => {
			const type = event.inputType;
			// Composition cannot be cancelled; it is read back when it ends.
			if (
				type === "insertCompositionText" ||
				type === "deleteCompositionText"
			) {
				return;
			}
			event.preventDefault();
			const target = event.getTargetRanges()[0];
			const range =
				target && root.contains(target.startContainer)
					? ([
							offsetAt(root, target.startContainer, target.startOffset),
							offsetAt(root, target.endContainer, target.endOffset),
						] as const)
					: undefined;
			const mark = formatInputs[type];
			if (mark) {
				toggle(mark);
				return;
			}
			switch (type) {
				case "insertText":
				case "insertReplacementText":
				case "insertFromYank": {
					const text =
						event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
					if (text !== "") insertText(text, range);
					return;
				}
				case "insertLineBreak":
				case "insertParagraph":
					insertText("\n", range);
					return;
				case "historyUndo":
					history("undo");
					return;
				case "historyRedo":
					history("redo");
					return;
				default:
					break;
			}
			// A cut and a drag are handled by their own events, and pasting by
			// the paste event; every other deletion removes its target range,
			// or the character beside a caret when the browser names none.
			if (
				!type.startsWith("delete") ||
				type === "deleteByCut" ||
				type === "deleteByDrag"
			) {
				return;
			}
			if (range && range[0] !== range[1]) {
				deleteRange(range[0], range[1]);
				return;
			}
			const [from, to] = ordered(readSelection());
			if (from !== to) deleteRange(from, to);
			else if (type.endsWith("Backward")) deleteRange(from - 1, from);
			else deleteRange(from, from + 1);
		};

		const onSelectionChange = () => {
			if (composing.current || root.ownerDocument.activeElement !== root) {
				return;
			}
			const selection = readSelection();
			if (
				selection.anchor !== placed.current.anchor ||
				selection.focus !== placed.current.focus
			) {
				pendingMarks.current = null;
				lastEdit.current = null;
				placed.current = selection;
			}
			model.current = { ...model.current, ...selection };
		};

		root.addEventListener("beforeinput", onBeforeInput);
		root.ownerDocument.addEventListener("selectionchange", onSelectionChange);
		return () => {
			root.removeEventListener("beforeinput", onBeforeInput);
			root.ownerDocument.removeEventListener(
				"selectionchange",
				onSelectionChange,
			);
		};
	}, []);

	const clipboardText = () => {
		const [from, to] = ordered(readSelection());
		return from === to
			? null
			: cellText(sliceInline(model.current.content, from, to));
	};

	const editor = (
		// A textarea cannot hold formatting, links, or images, which is the
		// whole reason this editor exists (#306). It is its own menu's trigger,
		// a `div` like the grid surface's, with the trigger's `select-none`
		// overridden by the editor's `select-text`.
		<ContextMenuTrigger
			ref={rootRef}
			// The editor is a control, named by position like the textarea was.
			role="textbox"
			tabIndex={0}
			aria-multiline="true"
			aria-label={ariaLabel}
			contentEditable
			suppressContentEditableWarning
			spellCheck={false}
			data-cell-editor
			onBlur={() => {
				if (suspended.current || composing.current) return;
				finish("commit");
			}}
			onFocus={() => {
				if (!suspended.current || dialogOpen.current) return;
				suspended.current = false;
				placeSelection();
			}}
			onCompositionStart={() => {
				composing.current = readSelection();
			}}
			onCompositionEnd={(event) => {
				const range = composing.current;
				composing.current = null;
				if (!range) return;
				// The browser wrote the composition into the page itself; the
				// model takes it over and redraws, which discards that writing.
				if (event.data === "") {
					draw();
					placeSelection();
					return;
				}
				insertText(event.data, ordered(range));
			}}
			onPaste={(event) => {
				event.preventDefault();
				event.stopPropagation();
				const text = event.clipboardData
					.getData("text/plain")
					.replace(/\r\n?/g, "\n");
				if (text !== "") {
					lastEdit.current = null;
					insertText(text);
					lastEdit.current = null;
				}
			}}
			onCopy={(event) => {
				event.stopPropagation();
				const text = clipboardText();
				if (text === null) return;
				event.preventDefault();
				event.clipboardData.setData("text/plain", text);
			}}
			onCut={(event) => {
				event.stopPropagation();
				const text = clipboardText();
				if (text === null) return;
				event.preventDefault();
				event.clipboardData.setData("text/plain", text);
				const [from, to] = ordered(readSelection());
				deleteRange(from, to);
			}}
			onDragStart={(event) => event.preventDefault()}
			onDrop={(event) => event.preventDefault()}
			onKeyDown={(event) => {
				// While editing, the grid must never see the keystroke, exactly as
				// with the textarea: see cell-editor.tsx.
				event.stopPropagation();
				if (composing.current || event.nativeEvent.isComposing) return;
				const mod = event.metaKey || event.ctrlKey;

				if (
					(event.key === "ContextMenu" ||
						(event.key === "F10" && event.shiftKey)) &&
					!event.altKey &&
					!mod
				) {
					// Stops the browser raising its own menu for the same chord.
					event.preventDefault();
					openMenuFromKeyboard();
					return;
				}

				const mark = markForKey(event);
				if (mark) {
					event.preventDefault();
					toggle(mark);
					return;
				}
				if (isLinkKey(event)) {
					event.preventDefault();
					requestLink();
					return;
				}
				if (mod && !event.altKey) {
					const key = event.key.toLowerCase();
					if (event.key === "Enter") {
						event.preventDefault();
						openLinkAtCaret();
						return;
					}
					if (key === "z") {
						event.preventDefault();
						history(event.shiftKey ? "redo" : "undo");
						return;
					}
					if (key === "y" && !event.shiftKey) {
						event.preventDefault();
						history("redo");
						return;
					}
				}

				if (event.key === "Enter") {
					event.preventDefault();
					if (event.shiftKey) insertText("\n");
					else finish("next-row");
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					finished.current = true;
					onFinish(initialValue, "cancel");
					return;
				}
				if (event.key === "Tab") {
					event.preventDefault();
					finish(event.shiftKey ? "previous-column" : "next-column");
					return;
				}
				if (event.key === "F2") {
					event.preventDefault();
					setMode((current) => (current === "enter" ? "edit" : "enter"));
					return;
				}
				const arrowExit = arrowExits[event.key];
				if (
					mode === "enter" &&
					arrowExit &&
					!event.shiftKey &&
					!event.altKey &&
					!mod
				) {
					event.preventDefault();
					finish(arrowExit);
				}
			}}
			className={cn(
				// Grows with its content over the rows below, as the textarea did,
				// without measuring: a block's height already follows its text.
				"absolute inset-x-0 top-0 z-10 min-h-full w-full cursor-text select-text whitespace-pre-wrap break-words bg-surface-code px-2 py-content-line-inset text-content leading-content-line",
				"outline-2 outline-selection-edge -outline-offset-2",
				align,
			)}
		/>
	);

	// Right-click, Shift+F10, or the ContextMenu key inside the editor opens a
	// menu of its own rather than the cell menu (#398): the Format group, Link…,
	// and Image…, acting on the range or the caret being edited, as their
	// shortcuts do. While it is open the editor is suspended, so the focus the
	// menu takes is not a commit, and closing it, whichever way, hands focus and
	// the selection back to the editor.
	const editorMenu = (
		<ContextMenu
			open={menu.open}
			onOpenChange={(open) => {
				if (open) {
					const selection = readSelection();
					menuSelection.current = selection;
					model.current = { ...model.current, ...selection };
					suspended.current = true;
				}
				menu.onOpenChange(open);
			}}
			onOpenChangeComplete={menu.onOpenChangeComplete}
		>
			{editor}
			<ContextMenuContent
				className="w-auto min-w-56"
				finalFocus={() => rootRef.current ?? true}
				// The menu is portalled out of the cell but still sits inside it in
				// React's tree, where a press would reach the cell's own handlers
				// and select it, ending the edit the menu acts on.
				onPointerDown={stopReactPropagation}
				onMouseDown={stopReactPropagation}
				onClick={stopReactPropagation}
				onDoubleClick={stopReactPropagation}
				onContextMenu={stopReactPropagation}
			>
				<FormatMenuGroup
					markControl={menuMarkControl}
					onMark={(mark) => toggle(mark, menuSelection.current)}
					linkRefusal={menuLinkRefusal()}
					onLink={() => runDialogCommand(requestLink)}
					imageRefusal={undefined}
					onImage={() => runDialogCommand(requestImage)}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);

	return (
		<>
			{/* The unavailable-image glyph, drawn once by React for the editor to
			    copy into its own content. */}
			<span ref={iconRef} hidden>
				<IconPhotoOff aria-hidden className="size-content-line self-center" />
			</span>
			{wrapped ? (
				// See cell-editor.tsx: an in-flow copy of the content keeps a wrapped
				// row as tall as what is being typed.
				<span
					aria-hidden
					className={cn("invisible block min-h-grid-row", wrappedLinesClass)}
				>
					<InlineContentView value={sizer} surface="grid-wrapped" />{" "}
				</span>
			) : null}
			{editorMenu}
		</>
	);
}
