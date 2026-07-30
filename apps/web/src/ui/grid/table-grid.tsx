import { cn } from "@tabelo/ui/lib/utils";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { matrixToHtml, matrixToTsv } from "@/clipboard/serialize";
import {
	type CellPosition,
	rectContains,
	selectionRect,
} from "@/core/selection";
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { AxisMenu } from "./axis-menu";
import { CellEditor } from "./cell-editor";
import { clampColumnWidth, resolveColumnWidth } from "./column-width";
import { GridContextMenu } from "./grid-context-menu";

const alignClass: Record<Alignment, string> = {
	default: "text-left",
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

const alignmentIcon = {
	default: AlignJustify,
	left: AlignLeft,
	center: AlignCenter,
	right: AlignRight,
} satisfies Record<Alignment, typeof AlignLeft>;

// The next cell in reading order, or nothing when there is none. This is how
// Tab knows it has reached an edge and should let focus leave the grid.
function adjacentCell(
	from: CellPosition,
	direction: 1 | -1,
	rows: number,
	columns: number,
): CellPosition | null {
	const index = from.row * columns + from.column + direction;
	if (index < 0 || index >= rows * columns) return null;
	return { row: Math.floor(index / columns), column: index % columns };
}

export function TableGrid({ zoom }: { readonly zoom: number }) {
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);
	const editing = useTabeloStore((state) => state.editing);
	const editingSeed = useTabeloStore((state) => state.editingSeed);
	const editingHeader = useTabeloStore((state) => state.editingHeader);

	const gridRef = useRef<HTMLTableElement>(null);
	const draggingRef = useRef<"cell" | "column" | null>(null);

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
			draggingRef.current = null;
		};
		window.addEventListener("pointerup", stop);
		return () => window.removeEventListener("pointerup", stop);
	}, []);

	const selectColumn = useCallback((column: number, extend: boolean) => {
		const store = useTabeloStore.getState();
		if (!extend) {
			store.selectCell({ row: 0, column }, "column");
			return;
		}

		const anchorColumn =
			store.selection.mode === "column"
				? store.selection.anchor.column
				: store.selection.focus.column;
		store.setSelection({
			anchor: { row: 0, column: anchorColumn },
			focus: { row: 0, column },
			mode: "column",
		});
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
			case "Tab": {
				// Tab walks the cells in reading order, the way a spreadsheet does,
				// but the grid is not a trap: at the very first and very last cell
				// the key is left to the browser so focus continues out of the grid.
				const next = adjacentCell(
					selection.focus,
					event.shiftKey ? -1 : 1,
					store.document.rows.length,
					store.document.columns.length,
				);
				if (!next) return;
				event.preventDefault();
				store.selectCell(next);
				return;
			}
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
				if (mod) {
					const refusal = store.deleteSelectedStructure();
					if (refusal) {
						store.setNotice(
							refusal === "last-column"
								? copy.disabled.lastRemainingColumn
								: copy.disabled.lastRemainingRow,
						);
					}
				} else store.clearSelection();
				return;
			default:
				break;
		}

		if (mod && event.key.toLowerCase() === "a") {
			event.preventDefault();
			store.setSelection({
				anchor: { row: 0, column: 0 },
				focus: {
					row: 0,
					column: store.document.columns.length - 1,
				},
				mode: "column",
			});
			return;
		}

		// A printable character replaces the cell and drops straight into the
		// editor, the way a spreadsheet does: it is the fastest path to typing.
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
	const contentWidth = document.columns.reduce(
		(total, column) => total + resolveColumnWidth(column.width),
		0,
	);

	return (
		<GridContextMenu>
			<table
				ref={gridRef}
				// Automatic table layout treats column widths as minimums and lets
				// long content expand them. Fixed layout plus an explicit total makes
				// the colgroup authoritative while preserving per-pane zoom.
				style={{
					width: `calc(var(--grid-gutter-w) + ${contentWidth * zoom}rem)`,
				}}
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
				className="table-fixed border-separate border-spacing-0 text-content"
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
					<col style={{ width: "var(--grid-gutter-w)" }} />
					{document.columns.map((column) => (
						<col
							key={column.id}
							style={{
								width: `${resolveColumnWidth(column.width) * zoom}rem`,
							}}
						/>
					))}
				</colgroup>

				<thead>
					<tr>
						<th
							scope="row"
							aria-label={copy.a11y.headerRow}
							className="sticky top-0 left-0 z-30 border-line-strong border-r border-b bg-surface-header text-center font-semibold text-foreground text-xs tabular-nums"
						>
							1
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
								focused={selection.focus.column === columnIndex}
								editing={editingHeader === columnIndex}
								width={resolveColumnWidth(column.width)}
								zoom={zoom}
								onSelect={(extend) => selectColumn(columnIndex, extend)}
								onDragStart={() => {
									draggingRef.current = "column";
								}}
								onDragEnter={() => {
									if (draggingRef.current !== "column") return;
									selectColumn(columnIndex, true);
								}}
							/>
						))}
					</tr>
				</thead>

				<tbody>
					{document.rows.map((row, rowIndex) => (
						// Explicit despite looking redundant: with role="grid" on the
						// table, browsers do not reliably expose implicit row and cell
						// roles: the computed tree came back as "generic" without these.
						<tr
							key={row.id}
							// biome-ignore lint/a11y/noRedundantRoles: see above
							role="row"
							// The header row is row 1, so the body starts at 2. This is
							// what makes the declared aria-rowcount add up.
							aria-rowindex={rowIndex + 2}
							className="group/row"
						>
							<th
								scope="row"
								// The heading a screen reader reads as the row context for
								// every cell beside it, so it names the row rather than
								// concatenating the two controls it contains.
								aria-label={copy.a11y.rowNumber(rowIndex)}
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
										className="cursor-pointer rounded-interactive px-1 hover:text-foreground"
										onClick={() =>
											useTabeloStore
												.getState()
												.selectCell({ row: rowIndex, column: 0 }, "row")
										}
									>
										{rowIndex + 2}
									</button>
									<AxisMenu
										axis="row"
										index={rowIndex}
										revealed={selection.focus.row === rowIndex}
									/>
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
										aria-colindex={columnIndex + 1}
										// Deliberately unlabelled: the cell's name is its value,
										// and the row and column headers supply the rest. An
										// aria-label here would replace the content with
										// coordinates and repeat them on every arrow key.
										title={value || undefined}
										className={cn(
											"relative overflow-hidden border-line-subtle border-r border-b px-2 py-1.5 align-top",
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
											draggingRef.current = "cell";
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
											if (draggingRef.current !== "cell") return;
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
												ariaLabel={copy.a11y.cellEditor(rowIndex, columnIndex)}
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
	// The column the user is working in, which is where its actions appear.
	readonly focused: boolean;
	readonly editing: boolean;
	// The stored width is in rem. Zoom scales what is rendered, so the drag
	// gesture converts viewport pixels back before writing a width down.
	readonly width: number;
	readonly zoom: number;
	readonly onSelect: (extend: boolean) => void;
	readonly onDragStart: () => void;
	readonly onDragEnter: () => void;
}

function HeaderCell({
	columnIndex,
	header,
	align,
	selected,
	focused,
	editing,
	width,
	zoom,
	onSelect,
	onDragStart,
	onDragEnter,
}: HeaderCellProps) {
	const AlignmentIcon = alignmentIcon[align];
	const resizeState = useRef<{
		startX: number;
		startWidth: number;
		rootFontSize: number;
	} | null>(null);

	return (
		<th
			scope="col"
			// The name a screen reader reads as the column context for every cell
			// below, so it is the header's own text rather than a description of
			// the two controls this cell contains.
			aria-label={copy.a11y.columnHeader(header, columnIndex)}
			aria-colindex={columnIndex + 1}
			aria-selected={selected}
			data-column-header={columnIndex}
			className={cn(
				"group/col sticky top-0 z-20 overflow-hidden border-line-strong border-r border-b bg-surface-header",
				"relative px-2 py-1.5 font-semibold",
				alignClass[align],
				selected && "bg-selection-fill",
			)}
			onPointerEnter={onDragEnter}
		>
			{editing ? (
				<CellEditor
					initialValue={header}
					align={alignClass[align]}
					ariaLabel={copy.a11y.headerEditor(header, columnIndex)}
					onFinish={(next, exit) => {
						const store = useTabeloStore.getState();
						if (exit !== "cancel") store.editHeader(columnIndex, next);
						store.setEditingHeader(null);
					}}
				/>
			) : (
				<div className="flex items-center gap-1">
					{/* Space selects the column, because that is what activating a
					    button does; Enter and F2 rename it, matching the cells below.
					    Both are the same pair the grid uses, so there is one thing to
					    learn rather than two. */}
					<button
						type="button"
						className={cn(
							"min-w-0 flex-1 cursor-pointer truncate",
							alignClass[align],
						)}
						title={`${copy.actions.editHeader} (${copy.shortcuts.editHeader})`}
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							onDragStart();
							onSelect(event.shiftKey || event.metaKey || event.ctrlKey);
						}}
						onClick={(event) => {
							// A keyboard-generated click has no pointer detail.
							if (event.detail === 0) onSelect(event.shiftKey);
						}}
						onDoubleClick={() =>
							useTabeloStore.getState().setEditingHeader(columnIndex)
						}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== "F2") return;
							// Without this the browser turns Enter into a click, which
							// would select the column instead of renaming it.
							event.preventDefault();
							useTabeloStore.getState().setEditingHeader(columnIndex);
						}}
					>
						{header}
					</button>
					<AlignmentIcon
						aria-hidden
						className="size-3.5 shrink-0 text-muted-foreground"
					/>
					<AxisMenu axis="column" index={columnIndex} revealed={focused} />
				</div>
			)}

			{/* Pointer-only by design, and hidden from assistive technology because
			    it duplicates a command: the column menu carries the same widen,
			    narrow, and reset without needing a drag. */}
			<div
				aria-hidden
				className="absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize touch-none hover:bg-selection-edge/40"
				onPointerDown={(event) => {
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					resizeState.current = {
						startX: event.clientX,
						startWidth: width,
						rootFontSize: Number.parseFloat(
							getComputedStyle(document.documentElement).fontSize,
						),
					};
				}}
				onPointerMove={(event) => {
					const state = resizeState.current;
					if (!state) return;
					useTabeloStore
						.getState()
						.resizeColumn(
							columnIndex,
							clampColumnWidth(
								state.startWidth +
									(event.clientX - state.startX) / (state.rootFontSize * zoom),
							),
						);
				}}
				onPointerUp={(event) => {
					event.currentTarget.releasePointerCapture(event.pointerId);
					resizeState.current = null;
				}}
			/>
		</th>
	);
}
