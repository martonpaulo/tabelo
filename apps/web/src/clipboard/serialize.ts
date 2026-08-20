import Papa from "papaparse";
import { cellText } from "@/core/cell-value";
import type { CellValue } from "@/core/types";
import { type ClipboardSelection, embedTabeloPayload } from "./payload";

// Copy writes two flavours: tab-separated text, which every spreadsheet
// understands, and an HTML table for targets that accept rich content. Papa
// handles quoting so a cell containing a tab or a newline survives.
//
// Both are text, and a cell may not be. Every value leaves through `cellText`,
// because there is one answer to what a value looks like and this is not the
// place to invent a second one.

// What is being copied. It selects both the confirmation and the recovery
// advice, because "select it and press the key" means something different in a
// table, in a source pane, and in a command that copies a format no pane is
// showing. It lives here rather than beside either consumer, so the wording and
// the action cannot drift apart.
export type CopyScope = "selection" | "source" | "preview" | "format";

export function matrixToTsv(matrix: readonly (readonly CellValue[])[]): string {
	return Papa.unparse(
		matrix.map((row) => row.map(cellText)),
		{ delimiter: "\t", newline: "\n" },
	);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function matrixToHtml(
	matrix: readonly (readonly CellValue[])[],
): string {
	const rows = matrix
		.map((row) => {
			const cells = row
				.map(
					(cell) =>
						`<td>${escapeHtml(cellText(cell)).replace(/\n/g, "<br>")}</td>`,
				)
				.join("");
			return `<tr>${cells}</tr>`;
		})
		.join("");
	return `<table><tbody>${rows}</tbody></table>`;
}

// A grid selection as the clipboard should carry it: the interoperable text and
// HTML every other application reads, with Tabelo's own types riding inertly
// inside the HTML. One function rather than two call sites assembling the same
// pair, so a flavour cannot be added to the menu path and forgotten on the
// keyboard one.
export function selectionClipboardPayload(selection: ClipboardSelection): {
	readonly text: string;
	readonly html: string;
} {
	return {
		text: matrixToTsv(selection.matrix),
		html: embedTabeloPayload(matrixToHtml(selection.matrix), selection),
	};
}
