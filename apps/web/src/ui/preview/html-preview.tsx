import { cn } from "@tabelo/ui/lib/utils";
import { memo, useMemo } from "react";
import { copy } from "@/copy/copy";
import { cellTextAt } from "@/core/cell-value";
import type { Alignment, Column, Row } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { visibleShape } from "./visible-shape";

// The rendered view shows the table as a reader would meet it, not as markup.
// It is built from the document directly rather than by injecting the HTML
// codec's output into the page: same result, no dangerouslySetInnerHTML, and
// no way for pasted content to become live markup.
//
// The reading model is a neutral document table, decided on #77: no card, no
// striping, thin uniform rules including the header, square outer corners. The
// preview answers "what will this look like once it leaves Tabelo", so it must
// not acquire a treatment of its own. See `docs/design-system.md` section 3.

const alignClass: Record<Alignment, string> = {
	default: "text-left",
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

export default function HtmlPreview() {
	const document = useTabeloStore((state) => state.document);

	// What the reader is shown, and why, lives in `visible-shape.ts`. It
	// recomputes only when the document changes, not when some other pane is
	// being typed into.
	const { columns: visibleColumns, rows: visibleRows } = useMemo(
		() => visibleShape(document),
		[document],
	);

	return (
		<div
			data-slot="preview-scroller"
			// The preview holds no controls, so this scroller is what entering the
			// pane has to land on: arrows scroll a focused scrollable element, and
			// that is the whole keyboard model this view needs. Explicitly -1 for
			// the same reason as the pane body, since the browser would otherwise
			// make an overflowing scroller a tab stop in the workspace ring.
			data-pane-entry
			tabIndex={-1}
			// The top offset is the grid's own index-strip height, not the pane's
			// usual padding: the grid has no equivalent to a preview row, only a
			// chrome strip above its first one, so lining the preview's first row
			// up with the grid's first row means starting it one strip down
			// instead of flush with the pane. Every later preview row then lands
			// on a grid row line too, since both share the same row height.
			className="tabelo-scroll-boundary h-full select-text overflow-auto px-4 pt-grid-strip pb-4"
		>
			{document.rows.length === 0 ? (
				<div
					data-slot="preview-empty"
					className="flex h-full flex-col items-center justify-center text-center"
				>
					<p className="font-medium text-sm">{copy.empty.previewTitle}</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{copy.empty.previewBody}
					</p>
				</div>
			) : (
				<table
					aria-label={copy.a11y.preview}
					// Sized to its content, capped at the pane: a two-column table is not
					// stretched across a wide pane, and a wide one wraps rather than
					// forcing the reader sideways. The scroller still shows the overflow
					// that content which cannot wrap produces.
					className="w-auto max-w-full border-collapse text-content"
				>
					<thead>
						<tr className="bg-surface-table-header">
							{visibleColumns.map((column) => (
								<th
									key={column.id}
									scope="col"
									className={cn(
										"border border-line-subtle px-3 py-1.5 align-top font-semibold",
										alignClass[column.align],
									)}
								>
									{column.header}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{visibleRows.map((row) => (
							<PreviewRow key={row.id} row={row} columns={visibleColumns} />
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

// One body row, behind a memo boundary, for the same reason the grid's DataRow
// has one: this component subscribes to the whole document, so a keystroke in a
// source pane re-renders it, and without this React reconciled every row to
// discover that all but one were identical. Both props are references
// `reconcileDocument` preserves, so the default shallow comparator is enough and
// no custom `areEqual` can drift out of sync with what this reads.
//
// The exception is a document that actually has a wholly empty column or row:
// `visibleShape` has to allocate a filtered array for that axis, so `columns`
// changes identity on every commit and this boundary stops paying. Left alone
// deliberately. The fix is to cache the filtered array on the surviving ids,
// which is a layer that the uncommon shape has not earned.
interface PreviewRowProps {
	readonly row: Row;
	readonly columns: readonly Column[];
}

const PreviewRow = memo(function PreviewRow({ row, columns }: PreviewRowProps) {
	return (
		<tr>
			{columns.map((column) => (
				<td
					key={column.id}
					className={cn(
						"border border-line-subtle px-3 py-1.5 align-top",
						alignClass[column.align],
					)}
				>
					{/* A cell may legitimately contain line breaks; preserving
					    them is the point of the escaping the codecs do. */}
					<span className="whitespace-pre-wrap">
						{cellTextAt(row, column.id)}
					</span>
				</td>
			))}
		</tr>
	);
});
