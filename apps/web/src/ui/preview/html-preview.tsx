import { cn } from "@tabelo/ui/lib/utils";
import { copy } from "@/copy/copy";
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";

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
			className="tabelo-scroll-boundary h-full select-text overflow-auto p-4"
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
							{document.columns.map((column) => (
								<th
									key={column.id}
									scope="col"
									className={cn(
										"border border-line-subtle px-3 py-2 font-semibold",
										alignClass[column.align],
									)}
								>
									{column.header}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{document.rows.map((row) => (
							<tr key={row.id}>
								{document.columns.map((column) => (
									<td
										key={column.id}
										className={cn(
											"border border-line-subtle px-3 py-2 align-top",
											alignClass[column.align],
										)}
									>
										{/* A cell may legitimately contain line breaks; preserving
									    them is the point of the escaping the codecs do. */}
										<span className="whitespace-pre-wrap">
											{row.cells[column.id] ?? ""}
										</span>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
