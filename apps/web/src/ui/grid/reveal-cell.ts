import { HEADER_ROW } from "@/core/selection";

// Bringing the focused cell into view, owned by the grid rather than left to
// the browser.
//
// `.tabelo-grid-scroller` still declares the optimal viewing region through
// `scroll-padding`, and that declaration remains correct for every scroll the
// browser starts by itself. It is not enough for the grid's own focus moves:
// Chrome honours only part of `scroll-padding-left` here, delivering roughly
// half of it, so the clearance the grid gets shrinks as the gutter grows. That
// left the cell under the sticky gutter and put the contract at the mercy of a
// few pixels of slack. See docs/design-system.md §9.
//
// The chrome is measured from the elements that draw it rather than recomputed
// from tokens. A sticky cell's own rectangle already is its stuck position, so
// the row gutter's right edge and the header row's bottom edge are exactly the
// two boundaries the contract is written about, at any pane zoom and any gutter
// width, with no second source of truth to keep in step.
export function revealGridCell(
	grid: HTMLTableElement,
	cell: HTMLElement,
	row: number,
): void {
	const scroller = grid.closest<HTMLElement>('[data-slot="panel-body"]');
	if (!scroller) return;

	const gutter = grid.querySelector<HTMLElement>("[data-row-header]");
	// A cell in the header row has only the index strip above it: the header row
	// is what it sits in, so reserving that row's height would push it away from
	// chrome that is not there.
	const above = grid.querySelector<HTMLElement>(
		row === HEADER_ROW
			? "[data-column-header]"
			: `[data-cell="${HEADER_ROW}:0"]`,
	);

	// The find bar sticks to the foot of the same scroller, so while it is open
	// it is the bottom of the content region rather than the scroller's edge. It
	// is measured like the two above it: the element that draws the boundary is
	// the boundary, at any zoom and whatever the bar's rows come to.
	const below = scroller.querySelector<HTMLElement>('[data-slot="find-bar"]');

	const view = scroller.getBoundingClientRect();
	const box = cell.getBoundingClientRect();
	// Where the content region begins on each axis, once the sticky chrome that
	// paints over it is taken off.
	const clearLeft = gutter ? gutter.getBoundingClientRect().right : view.left;
	const clearTop = above ? above.getBoundingClientRect().bottom : view.top;
	const clearBottom = below ? below.getBoundingClientRect().top : view.bottom;

	const left = clearingScroll(box.left, box.right, clearLeft, view.right);
	const top = clearingScroll(box.top, box.bottom, clearTop, clearBottom);

	if (left === 0 && top === 0) return;
	scroller.scrollBy({ left, top, behavior: "auto" });
}

// The smallest scroll along one axis that clears the chrome.
//
// Both edges can be satisfied only while the cell fits in what the chrome
// leaves over. When it does not, the leading edge wins: it is where the value
// starts, so aligning the trailing edge instead would scroll the beginning of
// the content out of sight to reveal an end the reader has not reached. A
// column may be set to 64rem against a pane a fraction of that wide, so this is
// an ordinary arrangement rather than an extreme one.
function clearingScroll(
	start: number,
	end: number,
	clear: number,
	viewEnd: number,
): number {
	if (start < clear || end - start > viewEnd - clear) {
		return awayFromZero(start - clear);
	}
	return awayFromZero(Math.max(0, end - viewEnd));
}

// Column widths and zoomed line boxes both land on fractions, so the distance
// to the chrome is rarely a whole pixel. A scroll offset is not: rounding the
// remainder towards zero leaves the cell a fraction of a pixel underneath the
// gutter, which is a failure of the contract however small it looks. Rounding
// outwards spends at most one pixel to keep it.
function awayFromZero(value: number): number {
	return value < 0 ? Math.floor(value) : Math.ceil(value);
}
