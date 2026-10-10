import { Checkbox } from "@tabelo/ui/components/checkbox";
import { cn } from "@tabelo/ui/lib/utils";
import { memo, useMemo, useRef } from "react";
import { copy } from "@/copy/copy";
import { cellText, cellTextContentAt, readCell } from "@/core/cell-value";
import { isDocumentBlank } from "@/core/document";
import type { Alignment, Column, Row } from "@/core/types";
import type { TableCodec } from "@/formats/types";
import { useTabeloStore } from "@/state/store";
import { InlineContentView } from "@/ui/inline/inline-content";
import { useCodecSpelling } from "@/ui/spelling";
import { usePaneFind } from "@/ui/workspace/use-pane-find";
import { usePreviewFind } from "./preview-find";
import { visibleShape } from "./visible-shape";

// The rendered view shows the table as a reader would meet it, not as markup.
// It is built from the document directly rather than by injecting the HTML
// codec's output into the page: same result, no dangerouslySetInnerHTML, and
// no way for pasted content to become live markup. Formatted content renders
// as the semantic elements it means, with the link and image safety rules of
// docs/adr/0011 (#306).
//
// The reading model is a neutral document table, decided on #77: no card, no
// striping, thin uniform rules including the header, square outer corners. The
// preview answers "what will this look like once it leaves Tabelo", so it must
// not acquire a treatment of its own. See `docs/design-system/3-components.md`.

const alignClass: Record<Alignment, string> = {
	default: "text-left",
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

export default function HtmlPreview({
	codec,
}: {
	// The codec this view borrows, whose spelling it shows in: a boolean is a
	// read-only checkbox exactly when that format writes one (#485).
	readonly codec: TableCodec | undefined;
}) {
	const document = useTabeloStore((state) => state.document);
	const { booleanMarks = false } = useCodecSpelling(codec);

	// What the reader is shown, and why, lives in `visible-shape.ts`. It
	// recomputes only when the document changes, not when some other pane is
	// being typed into.
	const { columns: visibleColumns, rows: visibleRows } = useMemo(
		() => visibleShape(document),
		[document],
	);
	// Where each visible row and column sits in the table, so a checkbox is
	// named by the same position the grid names it by.
	const positions = useMemo(
		() => ({
			rows: new Map(document.rows.map((row, index) => [row.id, index])),
			columns: new Map(
				document.columns.map((column, index) => [column.id, index]),
			),
		}),
		[document],
	);

	const scroller = useRef<HTMLDivElement>(null);
	usePreviewFind(scroller, document);
	const paneFind = usePaneFind();

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the pane's focusable entry target takes the find chord, like the grid surface does
		<div
			ref={scroller}
			data-slot="preview-scroller"
			// The preview holds no controls, so this scroller is what entering the
			// pane has to land on: arrows scroll a focused scrollable element, and
			// that is the whole keyboard model this view needs. Explicitly -1 for
			// the same reason as the pane body, since the browser would otherwise
			// make an overflowing scroller a tab stop in the workspace ring.
			data-pane-entry
			tabIndex={-1}
			// Find is taken from the browser here as in every other pane (#280):
			// its own find would search the page chrome, not what this pane shows.
			onKeyDown={(event) => {
				if (
					(event.metaKey || event.ctrlKey) &&
					!event.altKey &&
					event.key.toLowerCase() === "f"
				) {
					event.preventDefault();
					paneFind.open();
				}
			}}
			className="tabelo-scroll-boundary h-full select-text overflow-auto p-4 pr-pane-trailing pb-pane-end"
		>
			{/* A table with nothing in it has nothing to read, so it shows the
			    empty state rather than a grid of blank cells (#357). */}
			{document.rows.length === 0 || isDocumentBlank(document) ? (
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
					// Drawn like the tables in Claude's own answers (owner,
					// 2026-09-19): one rounded hairline around the table, a quiet
					// header band, and row lines only, no vertical dividers.
					className="w-auto max-w-full border-separate border-spacing-0 overflow-hidden rounded-interactive border border-line-subtle text-content"
				>
					<thead>
						<tr className="bg-surface-header">
							{visibleColumns.map((column) => (
								<th
									key={column.id}
									scope="col"
									className={cn(
										"px-4 py-2 align-top font-medium",
										alignClass[column.align],
									)}
								>
									<InlineContentView value={column.header} />
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{visibleRows.map((row) => (
							<PreviewRow
								key={row.id}
								row={row}
								rowIndex={positions.rows.get(row.id) ?? 0}
								columns={visibleColumns}
								columnIndexes={positions.columns}
								booleanMarks={booleanMarks}
							/>
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
	readonly rowIndex: number;
	readonly columns: readonly Column[];
	readonly columnIndexes: ReadonlyMap<string, number>;
	readonly booleanMarks: boolean;
}

const PreviewRow = memo(function PreviewRow({
	row,
	rowIndex,
	columns,
	columnIndexes,
	booleanMarks,
}: PreviewRowProps) {
	return (
		<tr>
			{columns.map((column) => (
				<td
					key={column.id}
					className={cn(
						"border-line-subtle border-t px-4 py-2 align-top",
						alignClass[column.align],
					)}
				>
					<PreviewCell
						row={row}
						column={column}
						label={() =>
							copy.a11y.booleanCell(
								cellText(column.header),
								columnIndexes.get(column.id) ?? 0,
								rowIndex,
							)
						}
						booleanMarks={booleanMarks}
					/>
				</td>
			))}
		</tr>
	);
});

// One cell's content. Under the HTML boolean spelling a boolean is the
// checkbox that format writes, drawn read-only: the preview shows the table
// and never edits it, and it holds no tab stop of its own. Anything else is
// its text, line breaks preserved, which is the point of the escaping the
// codecs do.
function PreviewCell({
	row,
	column,
	label,
	booleanMarks,
}: {
	readonly row: Row;
	readonly column: Column;
	readonly label: () => string;
	readonly booleanMarks: boolean;
}) {
	const value = readCell(row, column.id);
	if (booleanMarks && typeof value === "boolean") {
		return (
			<Checkbox
				checked={value}
				readOnly
				tabIndex={-1}
				aria-label={label()}
				className="inline-flex cursor-default align-middle"
			/>
		);
	}
	return (
		<span className="whitespace-pre-wrap">
			<InlineContentView value={cellTextContentAt(row, column.id)} />
		</span>
	);
}
