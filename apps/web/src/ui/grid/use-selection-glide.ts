import { type RefObject, useLayoutEffect, useRef } from "react";

import type { CellPosition } from "@/core/selection";

// The focused cell's mark travels to the cell the selection moved to instead
// of appearing there (owner, 2026-09-19). The marks themselves do not move:
// every cell draws its own (see `CellMarks`) and clips its content to its own
// edges, so a mark cannot leave the cell that owns it. One element over the
// grid surface stands in for it while it travels, starting where the mark was
// and easing to where the mark now is, with the real mark hidden for exactly
// that long. The selection, the fill handle, the copied marks, and the pinned
// layers are untouched, and the real mark stays on the focused cell for every
// locator that looks for it.
//
// Transform only, so nothing in the table is laid out again while it moves.

// How far apart two positions have to be, in rem, before the move is a move
// rather than the same mark drawn again in place.
const STILL = 0.01;

// The longest the stand-in may stay up when no `transitionend` arrives, for
// instance because the pane was hidden mid-move. Comfortably past
// `--motion-selection` so it never cuts a running move short.
const GLIDE_TIMEOUT_MS = 400;

interface GlidePoint {
	readonly left: number;
	readonly top: number;
}

// Where the arriving mark starts, measured from where it has arrived: the
// offset that puts it back on the cell the selection just left. Nothing when
// the two coincide, which is what a redraw in place looks like from here.
function glideTravel(from: GlidePoint, to: GlidePoint): GlidePoint | null {
	const left = from.left - to.left;
	const top = from.top - to.top;
	if (Math.abs(left) < STILL && Math.abs(top) < STILL) return null;
	return { left, top };
}

// The stand-in the grid renders over its surface. The hook places it, runs the
// one transition, and hands back to the real mark.
export function useSelectionGlide(
	surfaceRef: RefObject<HTMLElement | null>,
	gridRef: RefObject<HTMLElement | null>,
	focus: CellPosition,
): RefObject<HTMLDivElement | null> {
	const ghostRef = useRef<HTMLDivElement>(null);
	const previousRef = useRef<CellPosition | null>(null);
	// Ends the move that is running, if one is. Also how the effect knows one
	// is running at all.
	const stopRef = useRef<(() => void) | null>(null);

	// Before paint, so the arriving mark is hidden in the same frame it is
	// drawn: after paint it would flash in the new cell first, which is the
	// blink this exists to remove.
	useLayoutEffect(() => {
		const previous = previousRef.current;
		previousRef.current = { row: focus.row, column: focus.column };
		const surface = surfaceRef.current;
		const grid = gridRef.current;
		const ghost = ghostRef.current;
		if (!previous || !surface || !grid || !ghost) return;
		if (previous.row === focus.row && previous.column === focus.column) return;

		// A move arriving while the mark is still travelling is the selection
		// moving faster than the mark can follow it, which is what holding an
		// arrow key does. The mark snaps to the cell the keyboard is on rather
		// than trailing behind the key.
		const running = stopRef.current;
		if (running) {
			running();
			return;
		}

		const view = surface.ownerDocument.defaultView;
		if (!view) return;
		// Reduced motion stands the whole stand-in down rather than leaving it to
		// the global rule that shortens every duration: a transition of
		// effectively no length still hides the real mark for a frame.
		if (view.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const mark = grid.querySelector<HTMLElement>(
			`[data-cell="${focus.row}:${focus.column}"] [data-focus-mark]`,
		);
		// No mark to travel to: the cell is being edited, and the editor draws
		// its own frame.
		if (!mark) return;
		const toCell = mark.closest<HTMLElement>("[data-cell]");
		const fromCell = grid.querySelector<HTMLElement>(
			`[data-cell="${previous.row}:${previous.column}"]`,
		);
		// The cell the selection left is gone, so there is nowhere to come from:
		// a removed row or column, or a document replaced under the selection.
		if (!toCell || !fromCell) return;

		const rootFontSize = Number.parseFloat(
			view.getComputedStyle(grid.ownerDocument.documentElement).fontSize,
		);
		if (!Number.isFinite(rootFontSize) || rootFontSize <= 0) return;

		const surfaceBox = surface.getBoundingClientRect();
		const markBox = mark.getBoundingClientRect();
		const toBox = toCell.getBoundingClientRect();
		const fromBox = fromCell.getBoundingClientRect();
		// A mark sits at the same offset inside every cell that draws one, so
		// where it was is the old cell's corner plus that offset. Measured
		// values, converted here at the boundary and never stored.
		const travel = glideTravel(
			{
				left: (fromBox.left + (markBox.left - toBox.left)) / rootFontSize,
				top: (fromBox.top + (markBox.top - toBox.top)) / rootFontSize,
			},
			{ left: markBox.left / rootFontSize, top: markBox.top / rootFontSize },
		);
		if (!travel) return;

		ghost.style.left = `${(markBox.left - surfaceBox.left) / rootFontSize}rem`;
		ghost.style.top = `${(markBox.top - surfaceBox.top) / rootFontSize}rem`;
		ghost.style.width = `${markBox.width / rootFontSize}rem`;
		ghost.style.height = `${markBox.height / rootFontSize}rem`;
		ghost.style.display = "block";
		ghost.style.transitionProperty = "none";
		ghost.style.transform = `translate(${travel.left}rem, ${travel.top}rem)`;
		// Reading layout back commits that starting position. Without it the
		// browser sees one style change, from the previous state to the final
		// one, and there is nothing to transition from.
		ghost.getBoundingClientRect();

		surface.setAttribute("data-selection-gliding", "true");
		ghost.style.transitionProperty = "";
		ghost.style.transform = "";

		let timer = 0;
		const finish = () => {
			view.clearTimeout(timer);
			ghost.removeEventListener("transitionend", finish);
			ghost.style.display = "none";
			ghost.style.transitionProperty = "none";
			ghost.style.transform = "";
			surface.removeAttribute("data-selection-gliding");
			stopRef.current = null;
		};
		timer = view.setTimeout(finish, GLIDE_TIMEOUT_MS);
		ghost.addEventListener("transitionend", finish);
		stopRef.current = finish;
	}, [focus.row, focus.column, surfaceRef, gridRef]);

	// Only on unmount: this effect must not end the move the next selection
	// change is about to inherit, and a cleanup that ran on every change would.
	useLayoutEffect(() => () => stopRef.current?.(), []);

	return ghostRef;
}
