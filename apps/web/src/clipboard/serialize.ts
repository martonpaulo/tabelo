import Papa from "papaparse";
import { cellText, headerContent } from "@/core/cell-value";
import type { CellValue, TextContent } from "@/core/types";
import { htmlCellContent } from "@/formats/html";
import { readClipboardTable } from "./parse";
import { type ClipboardSelection, embedTabeloPayload } from "./payload";

// Copy writes two flavours: tab-separated text, which every spreadsheet
// understands, and an HTML table for targets that accept rich content. Papa
// handles quoting so a cell containing a tab or a newline survives.
//
// The text flavour leaves every value through `cellText`, because there is one
// answer to what a value looks like and this is not the place to invent a
// second one. The HTML flavour writes each cell as the HTML codec does, so
// bold text, links, and images arrive with their meaning (#306), and a native
// value arrives as its projection.

// What is being copied. It selects both the confirmation and the recovery
// advice, because "select it and press the key" means something different in a
// table, in a source pane, and in a command that copies a format no pane is
// showing. It lives here rather than beside either consumer, so the wording and
// the action cannot drift apart.
export type CopyScope = "selection" | "source" | "preview" | "format";

export function matrixToTsv(matrix: readonly (readonly CellValue[])[]): string {
	const values = matrix.map((row) => row.map(cellText));
	const tsv = Papa.unparse(values, { delimiter: "\t", newline: "\n" });
	if (values.some((row) => row.length !== 1) || readsBackAs(tsv, values)) {
		return tsv;
	}
	// One column carries no tab, so pasted alone this text is read as plain
	// text, which keeps the quotes Papa adds around a boundary space or a
	// double quote (#491). The bare lines are written instead, but only when
	// they read back as the same values and need no qualifier in
	// tab-separated values, so a spreadsheet still reads the same cells: no
	// tab, no line break, and no double quote opening a value. A line break
	// inside a value has no plain spelling at all, and a value that opens
	// with a quote keeps the spreadsheet's reading; both stay quoted, and the
	// HTML flavour beside them is what carries them exactly.
	const lines = values.map(([value = ""]) => value);
	const bare = lines.join("\n");
	const plain = lines.every((value) => !/[\t\r\n]|^"/.test(value));
	if (plain && readsBackAs(bare, values)) return bare;
	// A comma or a semicolon makes the reader take the text as comma-separated
	// values, which splits a value Papa left unquoted, and the bare lines are
	// the same text (#500). Quoting every field keeps each value whole there,
	// and a spreadsheet reads the same quotes as qualifiers around the same
	// cells. Lines that form a Markdown table have no spelling the reader
	// takes back exactly, so they keep Papa's output, and the HTML flavour
	// carries them.
	const quoted = Papa.unparse(values, {
		delimiter: "\t",
		newline: "\n",
		quotes: true,
	});
	return readsBackAs(quoted, values) ? quoted : tsv;
}

// Whether the clipboard reader, given this text and no other flavour, returns
// exactly these values.
function readsBackAs(
	text: string,
	values: readonly (readonly string[])[],
): boolean {
	const read = readClipboardTable({ text })?.matrix;
	return (
		read !== undefined &&
		read.length === values.length &&
		read.every(
			(row, index) =>
				row.length === values[index]?.length &&
				row.every((cell, column) => cellText(cell) === values[index]?.[column]),
		)
	);
}

export function matrixToHtml(
	matrix: readonly (readonly CellValue[])[],
): string {
	const rows = matrix
		.map((row) => {
			const cells = row
				.map((cell) => `<td>${htmlCellContent(headerContent(cell))}</td>`)
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

// A fragment of one cell, copied out of the rich cell editor (#306): its plain
// text, its semantic markup for other applications, and its exact structure for
// Tabelo, which the markup beside it is checked against when it is pasted back.
// The markup is wrapped in one neutral element because the HTML parser drops
// whitespace that opens a document, and a fragment may start with a space.
export function inlineClipboardPayload(content: TextContent): {
	readonly text: string;
	readonly html: string;
} {
	return {
		text: cellText(content),
		html: embedTabeloPayload(`<span>${htmlCellContent(content)}</span>`, {
			matrix: [[content]],
			expectedTypes: ["text"],
		}),
	};
}
