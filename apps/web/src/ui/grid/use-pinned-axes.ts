import { type RefObject, useLayoutEffect } from "react";
import type { TableDocument } from "@/core/types";

// The three lengths the pinned data layers need and no token can state.
//
// The row-number gutter is a fixed token width, so a pinned first data column
// resolves its own offset from `--grid-gutter-w` in CSS. The other direction has
// no such answer: the header row is one content line box tall until a wrapped
// header makes it taller, and the pinned row's own height follows whatever its
// tallest cell wraps to. Both are measured from the elements that draw them, for
// the reason `reveal-cell.ts` gives: a sticky cell's own rectangle already is its
// stuck position, at any pane zoom and any column width.
//
// `--grid-header-h` lands on the table, where the pinned cells read it.
// The two extents land on the scroll container, which is what declares the
// optimal viewing region for every scroll the browser starts by itself. Each is
// removed again as soon as its layer is unpinned, so absent reads as unpinned
// rather than as zero-sized.
const HEADER_HEIGHT = "--grid-header-h";
const PINNED_ROW_HEIGHT = "--grid-pinned-row-h";
const PINNED_COLUMN_WIDTH = "--grid-pinned-column-w";

interface PinnedAxesOptions {
	readonly gridRef: RefObject<HTMLTableElement | null>;
	// Already narrowed to whether the layer actually renders, so a preference
	// that is on for a table too small to pin publishes nothing.
	readonly pinnedRow: boolean;
	readonly pinnedColumn: boolean;
	// What can move these measurements without moving the two flags: the
	// document behind the cells, the pane's content scale, the column widths,
	// and which columns wrap.
	readonly document: TableDocument;
	readonly zoom: number;
	readonly columnWidths: Readonly<Record<string, number>>;
	readonly wrappedColumns: readonly string[];
}

function toRem(pixels: number, grid: HTMLElement): number {
	const root = getComputedStyle(grid.ownerDocument.documentElement).fontSize;
	return pixels / Number.parseFloat(root);
}

function write(target: HTMLElement | null, name: string, value: number): void {
	target?.style.setProperty(name, `${value}rem`);
}

function clear(target: HTMLElement | null, name: string): void {
	target?.style.removeProperty(name);
}

export function usePinnedAxes({
	gridRef,
	pinnedRow,
	pinnedColumn,
	document,
	zoom,
	columnWidths,
	wrappedColumns,
}: PinnedAxesOptions): void {
	// The last four are triggers rather than inputs: the effect reads the DOM,
	// and these are what moves what it would read. Measuring on every render
	// instead would force a reflow on every arrow key, which is the cost this
	// grid is built to avoid.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const grid = gridRef.current;
		if (!grid) return;
		const scroller = grid.closest<HTMLElement>('[data-slot="panel-body"]');

		if (pinnedRow) {
			const header = grid.querySelector<HTMLElement>('[data-row-header="-1"]');
			const first = grid.querySelector<HTMLElement>('[data-row-header="0"]');
			if (header) {
				const height = header.getBoundingClientRect().height;
				write(grid, HEADER_HEIGHT, toRem(height, grid));
			}
			if (first) {
				const height = first.getBoundingClientRect().height;
				write(scroller, PINNED_ROW_HEIGHT, toRem(height, grid));
			}
		} else {
			clear(grid, HEADER_HEIGHT);
			clear(scroller, PINNED_ROW_HEIGHT);
		}

		if (pinnedColumn) {
			const cell = grid.querySelector<HTMLElement>('[data-cell="-1:0"]');
			if (cell) {
				const width = cell.getBoundingClientRect().width;
				write(scroller, PINNED_COLUMN_WIDTH, toRem(width, grid));
			}
		} else {
			clear(scroller, PINNED_COLUMN_WIDTH);
		}

		return () => {
			clear(grid, HEADER_HEIGHT);
			clear(scroller, PINNED_ROW_HEIGHT);
			clear(scroller, PINNED_COLUMN_WIDTH);
		};
	}, [
		gridRef,
		pinnedRow,
		pinnedColumn,
		document,
		zoom,
		columnWidths,
		wrappedColumns,
	]);
}
