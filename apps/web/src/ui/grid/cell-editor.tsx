import { cn } from "@tabelo/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

// A textarea rather than an input, because a cell may legitimately contain a
// line break (CSV allows it) and an input would silently flatten it. Enter
// commits, Shift+Enter inserts the break.

export type EditorExit =
	| "commit"
	| "cancel"
	| "next-row"
	| "previous-row"
	| "next-column"
	| "previous-column";

// Google Sheets' two edit modes, which the owner asked the grid to match (#366).
// An edit started by typing over a cell is "enter": it is quick entry, so every
// arrow key commits and moves to the neighbouring cell. An edit started with
// F2, Enter, or a double click is "edit": the user came to change the text, so
// the arrows move the caret. F2 switches between the two while editing.
export type CellEditMode = "enter" | "edit";

const arrowExits: Partial<Record<string, EditorExit>> = {
	ArrowUp: "previous-row",
	ArrowDown: "next-row",
	ArrowLeft: "previous-column",
	ArrowRight: "next-column",
};

// How a wrapped value lays out its lines: the text's own line height, with the
// single-line box's spare height split above and below (#374). The grid's
// wrapped value and header spans use it, and so does the editor's sizer below,
// which is what keeps a wrapped row the same height while it is edited.
export const wrappedLinesClass =
	"whitespace-pre-wrap break-words py-content-line-inset leading-content-line";

interface CellEditorProps {
	readonly initialValue: string;
	readonly align: string;
	readonly ariaLabel: string;
	readonly monospace?: boolean;
	// In a wrapped column the row's height comes from the value, so the editor
	// has to keep supplying it: see the sizer below.
	readonly wrapped?: boolean;
	// Without one the editor keeps every arrow for the caret, which is what the
	// header editor wants.
	readonly initialMode?: CellEditMode;
	readonly onFinish: (value: string, exit: EditorExit) => void;
}

export function CellEditor({
	initialValue,
	align,
	ariaLabel,
	monospace = false,
	wrapped = false,
	initialMode = "edit",
	onFinish,
}: CellEditorProps) {
	const [value, setValue] = useState(initialValue);
	const [mode, setMode] = useState<CellEditMode>(initialMode);
	const ref = useRef<HTMLTextAreaElement>(null);
	// Guards against the blur handler firing a second commit after Enter.
	const finished = useRef(false);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		element.focus();
		element.setSelectionRange(element.value.length, element.value.length);
	}, []);

	// A non-wrapped column normally clips a cell's text to one line. That
	// truncation is a display choice for content the user isn't touching, not a
	// limit on what they can see while editing it: growing the editor to fit
	// its wrapped content, momentarily, is what lets the cell's own value stay
	// legible without changing the column's wrap preference or the document.
	// value drives the remeasure on every keystroke even though the effect body
	// reads it through the DOM (scrollHeight), not as a variable. A wrapped
	// column needs none of this: its row already grows with the sizer.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element || wrapped) return;
		element.style.height = "0px";
		element.style.height = `${element.scrollHeight}px`;
	}, [value, wrapped]);

	const finish = (exit: EditorExit) => {
		if (finished.current) return;
		finished.current = true;
		onFinish(value, exit);
	};

	const editor = (
		<textarea
			ref={ref}
			aria-label={ariaLabel}
			value={value}
			rows={1}
			spellCheck={false}
			onChange={(event) => setValue(event.target.value)}
			onBlur={() => finish("commit")}
			onKeyDown={(event) => {
				// While editing, the grid must never see the keystroke. Without this
				// the Enter that commits also bubbles up to the grid, which: by
				// then no longer editing: reads it as "start editing" and reopens
				// the editor on the cell the user just left.
				event.stopPropagation();

				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					finish("next-row");
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
				// In enter mode a bare arrow commits and moves; with a modifier, or in
				// edit mode, it belongs to the textarea and moves the caret.
				const arrowExit = arrowExits[event.key];
				if (
					mode === "enter" &&
					arrowExit &&
					!event.shiftKey &&
					!event.altKey &&
					!event.metaKey &&
					!event.ctrlKey
				) {
					event.preventDefault();
					finish(arrowExit);
				}
			}}
			// overflow-hidden because the editor is always as tall as its text, and
			// a scrollbar shown while it measures at height 0 would narrow the text
			// and add a line that is not there.
			className={cn(
				"absolute inset-0 z-10 h-full w-full cursor-text resize-none overflow-hidden break-words bg-background px-2 py-content-line-inset text-content leading-content-line",
				"outline-2 outline-selection-edge -outline-offset-2",
				monospace && "font-value",
				align,
			)}
		/>
	);
	if (!wrapped) return editor;
	// The textarea is an overlay, so on its own it gives the row no height and a
	// wrapped row would collapse to one line while it is edited (#375). This
	// invisible copy of the draft sits in the cell's flow with the wrapped
	// value's own layout, so the row keeps the value's height and grows as it is
	// typed. The trailing space gives a final line break a line to occupy.
	return (
		<>
			<span
				aria-hidden
				className={cn(
					"invisible block min-h-grid-row",
					wrappedLinesClass,
					monospace && "font-value",
				)}
			>
				{`${value} `}
			</span>
			{editor}
		</>
	);
}
