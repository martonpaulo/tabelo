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
