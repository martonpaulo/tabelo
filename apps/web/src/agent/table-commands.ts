import type { TableOperation } from "@tabelo/agent-protocol";
import { readCell } from "@/core/cell-value";
import { isInlineContent } from "@/core/inline-content";
import {
	deleteColumns,
	deleteRows,
	insertColumns,
	insertRows,
	moveColumns,
	moveRows,
	setAlignment,
	setCell,
	setHeader,
} from "@/core/operations";
import {
	type CellPosition,
	clampSelection,
	type GridSelection,
	HEADER_ROW,
} from "@/core/selection";
import type { TableDocument } from "@/core/types";
import { tableShapeLimitError } from "@/import/prepare";

class CommandRefusal extends Error {}

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new CommandRefusal("target_missing");
	return value;
}

type Anchor = Extract<TableOperation, { kind: "insert_rows" }>["anchor"];
type PreparedTable =
	| { ok: true; document: TableDocument; created: Record<string, string> }
	| { ok: false; code: string };

export function prepareTable(
	original: TableDocument,
	operations: readonly TableOperation[],
): PreparedTable {
	let document = original;
	const created: Record<string, string> = Object.create(null);
	const resolve = (id: string) =>
		id.startsWith("$") ? (created[id] ?? "") : id;
	const indexOf = (items: readonly { id: string }[], id: string) => {
		const index = items.findIndex((item) => item.id === resolve(id));
		if (index < 0) throw new CommandRefusal("target_missing");
		return index;
	};
	const position = (items: readonly { id: string }[], anchor: Anchor) => {
		if ("edge" in anchor) return anchor.edge === "start" ? 0 : items.length;
		return indexOf(items, anchor.id) + (anchor.side === "after" ? 1 : 0);
	};
	const checkSize = (rows: number, columns: number) => {
		if (tableShapeLimitError({ rows, columns }))
			throw new CommandRefusal("table_too_large");
	};
	const claim = (refs: readonly string[]) => {
		if (
			new Set(refs).size !== refs.length ||
			refs.some((ref) => created[ref] !== undefined)
		)
			throw new CommandRefusal("duplicate_reference");
	};
	try {
		for (const operation of operations) {
			switch (operation.kind) {
				case "set_cells":
					for (const cell of operation.cells) {
						const row = indexOf(document.rows, cell.rowId);
						const column = indexOf(document.columns, cell.columnId);
						const current = readCell(
							required(document.rows[row]),
							required(document.columns[column]).id,
						);
						if (isInlineContent(current) && !cell.replaceInline)
							throw new CommandRefusal("would_drop_inline_content");
						document = setCell(document, row, column, cell.value);
					}
					break;
				case "set_header": {
					const column = indexOf(document.columns, operation.columnId);
					if (
						isInlineContent(required(document.columns[column]).header) &&
						!operation.replaceInline
					)
						throw new CommandRefusal("would_drop_inline_content");
					document = setHeader(document, column, operation.value);
					break;
				}
				case "insert_rows": {
					claim(operation.refs);
					checkSize(
						document.rows.length + operation.refs.length,
						document.columns.length,
					);
					const at = position(document.rows, operation.anchor);
					document = insertRows(document, at, operation.refs.length);
					operation.refs.forEach((ref, offset) => {
						created[ref] = required(document.rows[at + offset]).id;
					});
					break;
				}
				case "insert_columns": {
					claim(operation.columns.map((column) => column.ref));
					checkSize(
						document.rows.length,
						document.columns.length + operation.columns.length,
					);
					const at = position(document.columns, operation.anchor);
					document = insertColumns(document, at, operation.columns.length);
					operation.columns.forEach((column, offset) => {
						created[column.ref] = required(document.columns[at + offset]).id;
						document = setHeader(document, at + offset, column.header);
					});
					break;
				}
				case "delete_rows":
					if (new Set(operation.ids.map(resolve)).size >= document.rows.length)
						throw new CommandRefusal("last_row");
					document = deleteRows(
						document,
						operation.ids.map((id) => indexOf(document.rows, id)),
					);
					break;
				case "delete_columns":
					if (
						new Set(operation.ids.map(resolve)).size >= document.columns.length
					)
						throw new CommandRefusal("last_column");
					document = deleteColumns(
						document,
						operation.ids.map((id) => indexOf(document.columns, id)),
					);
					break;
				case "move_row":
				case "move_column": {
					const items =
						operation.kind === "move_row" ? document.rows : document.columns;
					const from = indexOf(items, operation.id);
					const anchorIndex = position(items, operation.anchor);
					const to = anchorIndex > from ? anchorIndex - 1 : anchorIndex;
					const move = operation.kind === "move_row" ? moveRows : moveColumns;
					document = move(document, { from, count: 1 }, to - from);
					break;
				}
				case "set_alignment":
					document = setAlignment(
						document,
						indexOf(document.columns, operation.columnId),
						operation.value,
					);
					break;
			}
		}
		checkSize(document.rows.length, document.columns.length);
		return { ok: true, document, created };
	} catch (error) {
		if (error instanceof CommandRefusal)
			return { ok: false, code: error.message };
		throw error;
	}
}

export function preserveSelection(
	selection: GridSelection,
	before: TableDocument,
	after: TableDocument,
): GridSelection {
	const remap = (position: CellPosition): CellPosition => {
		const rowId = before.rows[position.row]?.id;
		const columnId = before.columns[position.column]?.id;
		const row = after.rows.findIndex((item) => item.id === rowId);
		const column = after.columns.findIndex((item) => item.id === columnId);
		return {
			row:
				position.row === HEADER_ROW ? HEADER_ROW : row < 0 ? position.row : row,
			column: column < 0 ? position.column : column,
		};
	};
	return clampSelection(
		{
			...selection,
			ranges: selection.ranges.map((range) => ({
				...range,
				anchor: remap(range.anchor),
				focus: remap(range.focus),
			})),
		},
		after.rows.length,
		after.columns.length,
	);
}
