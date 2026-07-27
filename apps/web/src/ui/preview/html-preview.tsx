import { cn } from "@tabelo/ui/lib/utils";
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// The rendered view shows the table as a reader would meet it, not as markup.
// It is built from the document directly rather than by injecting the HTML
// codec's output into the page: same result, no dangerouslySetInnerHTML, and
// no way for pasted content to become live markup.

const alignClass: Record<Alignment, string> = {
	default: "text-left",
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

export default function HtmlPreview() {
	const document = useTabeloStore((state) => state.document);

	return (
		<div className="h-full overflow-auto p-6">
			<table
				aria-label={copy.a11y.preview}
				className="w-full border-collapse text-content"
			>
				<thead>
					<tr>
						{document.columns.map((column) => (
							<th
								key={column.id}
								scope="col"
								className={cn(
									"border-line-strong border-b-2 px-3 py-2 font-semibold",
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
						<tr key={row.id} className="even:bg-surface-header/60">
							{document.columns.map((column) => (
								<td
									key={column.id}
									className={cn(
										"border-line-subtle border-b px-3 py-2 align-top",
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
		</div>
	);
}
