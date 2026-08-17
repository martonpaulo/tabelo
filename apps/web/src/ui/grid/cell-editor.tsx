import { cn } from "@tabelo/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

// A textarea rather than an input, because a cell may legitimately contain a
// line break (CSV allows it) and an input would silently flatten it. Enter
// commits, Shift+Enter inserts the break.

export type EditorExit =
	| "commit"
	| "cancel"
	| "next-row"
	| "next-column"
	| "previous-column";

interface CellEditorProps {
	readonly initialValue: string;
	readonly align: string;
	readonly ariaLabel: string;
	readonly monospace?: boolean;
	readonly onFinish: (value: string, exit: EditorExit) => void;
}

export function CellEditor({
	initialValue,
	align,
	ariaLabel,
	monospace = false,
	onFinish,
}: CellEditorProps) {
	const [value, setValue] = useState(initialValue);
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
	// reads it through the DOM (scrollHeight), not as a variable.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		element.style.height = "0px";
		element.style.height = `${element.scrollHeight}px`;
	}, [value]);

	const finish = (exit: EditorExit) => {
		if (finished.current) return;
		finished.current = true;
		onFinish(value, exit);
	};

	return (
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
				// Everything else belongs to the textarea, including arrow keys.
				// while editing, arrows move the caret, not the selection.
			}}
			className={cn(
				"absolute inset-0 z-10 h-full w-full cursor-text resize-none break-words bg-background px-2 text-content leading-content-line-box",
				"outline-2 outline-selection-edge -outline-offset-2",
				monospace && "font-value",
				align,
			)}
		/>
	);
}
