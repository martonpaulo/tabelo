import Papa from "papaparse";
import { cellText } from "@/core/cell-value";
import type { CellValue } from "@/core/types";
import { normalizeLineEndings } from "@/formats/html";
import { type ClipboardSelection, encodeTabeloPayload } from "./payload";

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
						`<td>${escapeHtml(normalizeLineEndings(cellText(cell))).replace(/\n/g, "<br>")}</td>`,
				)
				.join("");
			return `<tr>${cells}</tr>`;
		})
		.join("");
	return `<table><tbody>${rows}</tbody></table>`;
}

// A grid selection as the clipboard should carry it: the interoperable text and
// HTML every other application reads, plus Tabelo's own types in a flavour of
// their own. One function rather than two call sites assembling the same set,
// so a flavour cannot be added to the menu path and forgotten on the keyboard
// one.
//
// The private flavour is absent when the selection is too large to bound. The
// copy still lands as text and HTML, so the values survive and only their types
// do not.
export function selectionClipboardPayload(selection: ClipboardSelection): {
	readonly text: string;
	readonly html: string;
	readonly typed?: string;
} {
	const text = matrixToTsv(selection.matrix);
	const html = matrixToHtml(selection.matrix);
	const typed = encodeTabeloPayload(selection);
	return typed === null ? { text, html } : { text, html, typed };
}
