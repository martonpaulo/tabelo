import { fitColumnWidth } from "@/workspace/column-width";

// The width that fits one column's rendered content, for the grid menu's Fit
// column to content. It reads only the DOM: the semantic table is the one
// place every value of the column is rendered, so it is passed in rather than
// found, and no store or document knowledge is needed to measure it.

function zoomNormalizedNaturalWidth(
	element: HTMLElement,
	zoom: number,
): number {
	const style = getComputedStyle(element);
	const clone = element.cloneNode(true) as HTMLElement;
	clone.removeAttribute("data-column-content");
	Object.assign(clone.style, {
		position: "fixed",
		top: "0",
		left: "-10000px",
		visibility: "hidden",
		pointerEvents: "none",
		width: "max-content",
		maxWidth: "none",
		height: "auto",
		overflow: "visible",
		whiteSpace: "pre",
		fontFamily: style.fontFamily,
		fontSize: `${Number.parseFloat(style.fontSize) / zoom}px`,
		fontStyle: style.fontStyle,
		fontWeight: style.fontWeight,
		fontStretch: style.fontStretch,
		fontKerning: style.fontKerning,
		fontFeatureSettings: style.fontFeatureSettings,
		fontVariationSettings: style.fontVariationSettings,
		letterSpacing: style.letterSpacing,
		wordSpacing: style.wordSpacing,
		textTransform: style.textTransform,
	});
	element.ownerDocument.body.append(clone);
	try {
		// Measure at the product's base content size, then express that value in
		// the current zoomed coordinate space for fitColumnWidth to normalize.
		// This avoids variable-font optical sizing changing stored widths when the
		// same text is fitted in panes with different content scales.
		return clone.scrollWidth * zoom;
	} finally {
		clone.remove();
	}
}

export function measureColumnFitWidth(
	table: HTMLTableElement,
	columnIndex: number,
	zoom: number,
): number | undefined {
	const content = Array.from(
		table.querySelectorAll<HTMLElement>(
			`[data-column-content="${columnIndex}"]`,
		),
	);
	if (content.length === 0) return undefined;
	const box = content[0]?.parentElement;
	if (!box) return undefined;
	const boxStyle = getComputedStyle(box);
	const decorationWidth = [
		boxStyle.paddingLeft,
		boxStyle.paddingRight,
		boxStyle.borderLeftWidth,
		boxStyle.borderRightWidth,
	].reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
	const rootFontSize = Number.parseFloat(
		getComputedStyle(table.ownerDocument.documentElement).fontSize,
	);
	return fitColumnWidth(
		Math.max(
			...content.map((element) => zoomNormalizedNaturalWidth(element, zoom)),
		),
		rootFontSize,
		zoom,
		decorationWidth,
	);
}

// What every column would need to show its content, for Fit columns to pane
// width (#404). A column nothing can be measured in reports undefined, and
// the caller falls back to the width that column already has.
export function measureColumnFitWidths(
	table: HTMLTableElement,
	columnCount: number,
	zoom: number,
): readonly (number | undefined)[] {
	return Array.from({ length: columnCount }, (_, index) =>
		measureColumnFitWidth(table, index, zoom),
	);
}

// The room a grid pane has for its columns, in rem, for Fit table to pane
// width (#404). Only the DOM knows it: the pane's own scroller states the
// width, the gutter keeps its token size at every zoom, and the trailing room
// after the last column is part of the layout rather than of a column. The
// content columns scale with the pane's zoom, so the answer is expressed in
// the same unzoomed rem the widths are stored in.
export function measurePaneColumnRoom(
	surface: HTMLElement,
	zoom: number,
): number | undefined {
	const scroller = surface.closest<HTMLElement>('[data-slot="panel-body"]');
	if (!scroller || zoom <= 0) return undefined;
	const width = scroller.clientWidth;
	if (!Number.isFinite(width) || width <= 0) return undefined;
	const rootFontSize = Number.parseFloat(
		getComputedStyle(surface.ownerDocument.documentElement).fontSize,
	);
	if (!(rootFontSize > 0)) return undefined;
	const surfaceStyle = getComputedStyle(surface);
	const gutter = Number.parseFloat(
		surfaceStyle.getPropertyValue("--grid-gutter-w"),
	);
	const trailing = Number.parseFloat(surfaceStyle.paddingRight) || 0;
	const room =
		width - (Number.isFinite(gutter) ? gutter * rootFontSize : 0) - trailing;
	if (room <= 0) return undefined;
	return room / (rootFontSize * zoom);
}
