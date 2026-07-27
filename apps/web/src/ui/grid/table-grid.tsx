import { cn } from "@tabelo/ui/lib/utils";
import { useCallback, useEffect, useRef } from "react";
import { matrixToHtml, matrixToTsv } from "@/clipboard/serialize";
import { rectContains, selectionRect } from "@/core/selection";
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { AxisMenu } from "./axis-menu";
import { CellEditor } from "./cell-editor";
import { GridContextMenu } from "./grid-context-menu";

const DEFAULT_COLUMN_WIDTH = 168;
const MIN_COLUMN_WIDTH = 72;
const GUTTER_WIDTH = 44;

const alignClass: Record<Alignment, string> = {
	default: "text-left",
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

export function TableGrid({ zoom }: { readonly zoom: number }) {
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);
	const editing = useTabeloStore((state) => state.editing);
	const editingSeed = useTabeloStore((state) => state.editingSeed);
	const editingHeader = useTabeloStore((state) => state.editingHeader);

	const gridRef = useRef<HTMLTableElement>(null);
	const draggingRef = useRef(false);

	const rect = selectionRect(
		selection,
		document.rows.length,
		document.columns.length,
	);

	// Tracks the edit that just ended, so focus can be handed back to the grid
	// when the cell editor unmounts and drops it on <body>.
	const wasEditingRef = useRef(false);

	// Keep DOM focus on the focused cell, but never steal it from the source
	// panel or a menu: follow the selection only when focus is already inside
	// the grid, or when an edit just finished and left focus with nobody.
	useEffect(() => {
		const isEditing = editing !== null || editingHeader !== null;
		const justFinishedEditing = wasEditingRef.current && !isEditing;
		wasEditingRef.current = isEditing;
		if (isEditing) return;

		const grid = gridRef.current;
		if (!grid) return;
		if (!grid.contains(window.document.activeElement) && !justFinishedEditing)
			return;

		const target = grid.querySelector<HTMLElement>(
			`[data-cell="${selection.focus.row}:${selection.focus.column}"]`,
		);
		target?.focus({ preventScroll: false });
	}, [selection.focus.row, selection.focus.column, editing, editingHeader]);

	useEffect(() => {
		const stop = () => {
			draggingRef.current = false;
		};
		window.addEventListener("pointerup", stop);
		return () => window.removeEventListener("pointerup", stop);
	}, []);

	const moveFocus = useCallback(
		(rowDelta: number, columnDelta: number, extend: boolean) => {
			const store = useTabeloStore.getState();
			const next = {
				row: Math.max(
					0,
					Math.min(
						store.selection.focus.row + rowDelta,
						store.document.rows.length - 1,
					),
				),
				column: Math.max(
					0,
					Math.min(
						store.selection.focus.column + columnDelta,
						store.document.columns.length - 1,
					),
				),
			};
			if (extend) store.extendSelection(next);
			else store.selectCell(next);
		},
		[],
	);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
		const store = useTabeloStore.getState();
		if (store.editing || store.editingHeader !== null) return;

		const mod = event.metaKey || event.ctrlKey;

		// Reordering shares the arrow keys with navigation, behind Alt. Keeping
		// it on the keyboard means drag is never the only way to reorder.
		if (event.altKey) {
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				event.preventDefault();
				store.selectCell({ row: rect.top, column: rect.left }, "row");
				store.moveSelectedRow(event.key === "ArrowUp" ? -1 : 1);
				return;
			}
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				store.selectCell({ row: rect.top, column: rect.left }, "column");
				store.moveSelectedColumn(event.key === "ArrowLeft" ? -1 : 1);
				return;
			}
		}

		switch (event.key) {
			case "ArrowUp":
				event.preventDefault();
				moveFocus(-1, 0, event.shiftKey);
				return;
			case "ArrowDown":
				event.preventDefault();
				moveFocus(1, 0, event.shiftKey);
				return;
			case "ArrowLeft":
				event.preventDefault();
				moveFocus(0, -1, event.shiftKey);
				return;
			case "ArrowRight":
				event.preventDefault();
				moveFocus(0, 1, event.shiftKey);
				return;
			case "Tab":
				event.preventDefault();
				moveFocus(0, event.shiftKey ? -1 : 1, false);
				return;
			case "Home":
				event.preventDefault();
				store.selectCell({ row: mod ? 0 : selection.focus.row, column: 0 });
				return;
			case "End":
				event.preventDefault();
				store.selectCell({
					row: mod ? store.document.rows.length - 1 : selection.focus.row,
					column: store.document.columns.length - 1,
				});
				return;
			case "Enter":
				event.preventDefault();
				if (mod) store.addRowBelow();
				else store.setEditing(selection.focus);
				return;
			case "F2":
				event.preventDefault();
				store.setEditing(selection.focus);
				return;
			case "Escape":
				event.preventDefault();
				store.selectCell(selection.focus);
				return;
			case "Delete":
			case "Backspace":
				// Backspace clears what is in the cells; the modifier removes the
				// rows or columns themselves. Both are prevented from reaching the
				// browser, which historically treated Backspace as "go back".
				event.preventDefault();
				if (mod) store.deleteSelectedStructure();
				else store.clearSelection();
				return;
			default:
				break;
		}

		if (mod && event.key.toLowerCase() === "a") {
			event.preventDefault();
			store.setSelection({
				anchor: { row: 0, column: 0 },
				focus: {
					row: store.document.rows.length - 1,
					column: store.document.columns.length - 1,
				},
				mode: "cell",
			});
			return;
		}

		// A printable character replaces the cell and drops straight into the
		// editor, the way a spreadsheet does — it is the fastest path to typing.
		if (!mod && !event.altKey && event.key.length === 1) {
			event.preventDefault();
			store.setEditing(selection.focus, event.key);
		}
	};

	const selectedMatrix = () => {
		const store = useTabeloStore.getState();
		const current = selectionRect(
			store.selection,
			store.document.rows.length,
			store.document.columns.length,
		);
		const body = store.document.rows
			.slice(current.top, current.bottom + 1)
			.map((row) =>
				store.document.columns
					.slice(current.left, current.right + 1)
					.map((column) => row.cells[column.id] ?? ""),
			);
		return store.selection.mode === "column"
			? [
					store.document.columns
						.slice(current.left, current.right + 1)
						.map((c) => c.header),
					...body,
				]
			: body;
	};

	const writeClipboard = (event: React.ClipboardEvent) => {
		const matrix = selectedMatrix();
		event.clipboardData.setData("text/plain", matrixToTsv(matrix));
		event.clipboardData.setData("text/html", matrixToHtml(matrix));
		event.preventDefault();
	};

	return (
		<GridContextMenu>
			<table
				ref={gridRef}
				// Grid semantics, not document-table semantics: this is an editable
				// widget with its own keyboard model, so assistive technology should
				// treat it that way. `<table role="grid">` is the ARIA Authoring
				// Practices pattern for exactly this; the lint rule is a heuristic that
				// does not model it. See docs/design-system.md §9.
				// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
				role="grid"
				aria-label={copy.a11y.grid}
				aria-rowcount={document.rows.length + 1}
				aria-colcount={document.columns.length}
				className="w-max border-separate border-spacing-0 text-content"
				onKeyDown={handleKeyDown}
				onCopy={(event) => {
					if (useTabeloStore.getState().editing) return;
					writeClipboard(event);
				}}
				onCut={(event) => {
					if (useTabeloStore.getState().editing) return;
					writeClipboard(event);
					useTabeloStore.getState().clearSelection();
				}}
				onPaste={(event) => {
					if (useTabeloStore.getState().editing) return;
					event.preventDefault();
					useTabeloStore.getState().pasteClipboard({
						text: event.clipboardData.getData("text/plain"),
						html: event.clipboardData.getData("text/html"),
					});
				}}
			>
				<colgroup>
					{/* The gutter holds row numbers and menu affordances rather than
					    table content, so it keeps its size at every zoom level. */}
					<col style={{ width: GUTTER_WIDTH }} />
					{document.columns.map((column) => (
						<col
							key={column.id}
							style={{
								width: Math.round(
									(column.width ?? DEFAULT_COLUMN_WIDTH) * zoom,
								),
							}}
						/>
					))}
				</colgroup>

				<thead>
					<tr>
						<th
							scope="col"
							className="sticky top-0 left-0 z-30 border-line-subtle border-r border-b bg-surface-header"
						>
							<span className="sr-only">{copy.a11y.grid}</span>
						</th>
						{document.columns.map((column, columnIndex) => (
							<HeaderCell
								key={column.id}
								columnIndex={columnIndex}
								header={column.header}
								align={column.align}
								selected={
									selection.mode === "column" &&
									rectContains(rect, 0, columnIndex)
								}
								editing={editingHeader === columnIndex}
								width={column.width ?? DEFAULT_COLUMN_WIDTH}
								zoom={zoom}
							/>
						))}
					</tr>
				</thead>

				<tbody>
					{document.rows.map((row, rowIndex) => (
						// Explicit despite looking redundant: with role="grid" on the
						// table, browsers do not reliably expose implicit row and cell
						// roles — the computed tree came back as "generic" without these.
						// biome-ignore lint/a11y/noRedundantRoles: see above
						<tr key={row.id} role="row" className="group/row">
							<th
								scope="row"
								data-row-header={rowIndex}
								className={cn(
									"sticky left-0 z-10 border-line-subtle border-r border-b bg-surface-gutter",
									"px-1 text-center font-normal text-muted-foreground text-xs tabular-nums",
									selection.mode === "row" &&
										rectContains(rect, rowIndex, 0) &&
										"bg-selection-fill text-foreground",
								)}
							>
								<div className="flex items-center justify-between gap-0.5">
									<button
										type="button"
										aria-label={`${copy.actions.selectRow}: ${copy.a11y.rowNumber(rowIndex)}`}
										className="rounded px-1 hover:text-foreground"
										onClick={() =>
											useTabeloStore
												.getState()
												.selectCell({ row: rowIndex, column: 0 }, "row")
										}
									>
										{rowIndex + 1}
									</button>
									<AxisMenu axis="row" index={rowIndex} />
								</div>
							</th>

							{document.columns.map((column, columnIndex) => {
								const isFocus =
									selection.focus.row === rowIndex &&
									selection.focus.column === columnIndex;
								const inSelection = rectContains(rect, rowIndex, columnIndex);
								const value = row.cells[column.id] ?? "";
								const isEditing =
									editing?.row === rowIndex && editing?.column === columnIndex;

								return (
									// gridcell is stated rather than left implicit, for the same
									// reason as the row role above: without it the computed
									// accessibility tree reported these cells as "generic".
									<td
										key={column.id}
										// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
										role="gridcell"
										data-cell={`${rowIndex}:${columnIndex}`}
										tabIndex={isFocus ? 0 : -1}
										aria-selected={inSelection}
										aria-label={copy.a11y.cell(rowIndex, columnIndex)}
										title={value.includes("\n") ? value : undefined}
										className={cn(
											"relative border-line-subtle border-r border-b px-2 py-1.5 align-top",
											"cursor-cell select-none",
											alignClass[column.align],
											inSelection ? "bg-selection-fill" : "bg-background",
											isFocus &&
												"outline-2 outline-selection-edge -outline-offset-2",
										)}
										onPointerDown={(event) => {
											if (event.button !== 0) return;
											// Without this, the browser's own mousedown handling runs
											// after ours and moves focus to <body>, because a <td> is
											// not focusable by default. The cell would look selected
											// but ignore every keystroke.
											event.preventDefault();
											draggingRef.current = true;
											const store = useTabeloStore.getState();
											if (event.shiftKey) {
												store.extendSelection({
													row: rowIndex,
													column: columnIndex,
												});
											} else {
												store.selectCell({
													row: rowIndex,
													column: columnIndex,
												});
											}
											event.currentTarget.focus();
										}}
										onPointerEnter={() => {
											if (!draggingRef.current) return;
											useTabeloStore.getState().extendSelection({
												row: rowIndex,
												column: columnIndex,
											});
										}}
										onDoubleClick={() =>
											useTabeloStore
												.getState()
												.setEditing({ row: rowIndex, column: columnIndex })
										}
									>
										{isEditing ? (
											<CellEditor
												initialValue={editingSeed ?? value}
												align={alignClass[column.align]}
												ariaLabel={copy.a11y.cell(rowIndex, columnIndex)}
												onFinish={(next, exit) => {
													const store = useTabeloStore.getState();
													if (exit !== "cancel")
														store.editCell(rowIndex, columnIndex, next);
													store.setEditing(null);
													if (exit === "next-row") {
														store.selectCell({
															row: Math.min(
																rowIndex + 1,
																store.document.rows.length - 1,
															),
															column: columnIndex,
														});
													} else if (exit === "next-column") {
														store.selectCell({
															row: rowIndex,
															column: Math.min(
																columnIndex + 1,
																store.document.columns.length - 1,
															),
														});
													} else if (exit === "previous-column") {
														store.selectCell({
															row: rowIndex,
															column: Math.max(columnIndex - 1, 0),
														});
													}
												}}
											/>
										) : (
											<span className="block h-content-line overflow-hidden whitespace-pre">
												{value}
											</span>
										)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</GridContextMenu>
	);
}

interface HeaderCellProps {
	readonly columnIndex: number;
	readonly header: string;
	readonly align: Alignment;
	readonly selected: boolean;
	readonly editing: boolean;
	// The stored width, in document units. Zoom scales what is rendered, so the
	// drag gesture converts screen pixels back before writing a width down.
	readonly width: number;
	readonly zoom: number;
}

function HeaderCell({
	columnIndex,
	header,
	align,
	selected,
	editing,
	width,
	zoom,
}: HeaderCellProps) {
	const resizeState = useRef<{ startX: number; startWidth: number } | null>(
		null,
	);

	return (
		<th
			scope="col"
			data-column-header={columnIndex}
			aria-label={copy.a11y.headerCell(columnIndex)}
			className={cn(
				"group/col sticky top-0 z-20 border-line-subtle border-r border-b bg-surface-header",
				"relative px-2 py-1.5 font-medium",
				alignClass[align],
				selected && "bg-selection-fill",
			)}
		>
			{editing ? (
				<CellEditor
					initialValue={header}
					align={alignClass[align]}
					ariaLabel={copy.a11y.headerCell(columnIndex)}
					onFinish={(next, exit) => {
						const store = useTabeloStore.getState();
						if (exit !== "cancel") store.editHeader(columnIndex, next);
						store.setEditingHeader(null);
					}}
				/>
			) : (
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="min-w-0 flex-1 truncate text-left"
						onClick={() =>
							useTabeloStore
								.getState()
								.selectCell({ row: 0, column: columnIndex }, "column")
						}
						onDoubleClick={() =>
							useTabeloStore.getState().setEditingHeader(columnIndex)
						}
					>
						{header}
					</button>
					<AxisMenu axis="column" index={columnIndex} />
				</div>
			)}

			{/* A pointer-only affordance, deliberately hidden from assistive
			    technology: column width is presentation, it never reaches the
			    document, and there is nothing here for a keyboard user to miss. */}
			<div
				aria-hidden
				className="absolute top-0 -right-1 z-20 h-full w-2 cursor-col-resize touch-none hover:bg-selection-edge/40"
				onPointerDown={(event) => {
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					resizeState.current = { startX: event.clientX, startWidth: width };
				}}
				onPointerMove={(event) => {
					const state = resizeState.current;
					if (!state) return;
					const next = Math.max(
						MIN_COLUMN_WIDTH,
						state.startWidth + (event.clientX - state.startX) / zoom,
					);
					useTabeloStore.getState().resizeColumn(columnIndex, next);
				}}
				onPointerUp={(event) => {
					event.currentTarget.releasePointerCapture(event.pointerId);
					resizeState.current = null;
				}}
			/>
		</th>
	);
}
