import Papa from "papaparse";

// Copy writes two flavours: tab-separated text, which every spreadsheet
// understands, and an HTML table for targets that accept rich content.
// Papa handles quoting so a cell containing a tab or a newline survives.

// What is being copied. It selects both the confirmation and the recovery
// advice, because "select it and press the key" means something different in a
// table, in a source pane, and in a command that copies a format no pane is
// showing. It lives here rather than beside either consumer, so the wording and
// the action cannot drift apart.
export type CopyScope = "selection" | "source" | "preview" | "format";

export function matrixToTsv(matrix: readonly (readonly string[])[]): string {
	return Papa.unparse(matrix as string[][], { delimiter: "\t", newline: "\n" });
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function matrixToHtml(matrix: readonly (readonly string[])[]): string {
	const rows = matrix
		.map((row) => {
			const cells = row
				.map((cell) => `<td>${escapeHtml(cell).replace(/\n/g, "<br>")}</td>`)
				.join("");
			return `<tr>${cells}</tr>`;
		})
		.join("");
	return `<table><tbody>${rows}</tbody></table>`;
}
