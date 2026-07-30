import { cn } from "@tabelo/ui/lib/utils";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { matrixToHtml, matrixToTsv } from "@/clipboard/serialize";
import {
	type CellPosition,
	HEADER_ROW,
	rectContains,
	selectionRect,
} from "@/core/selection";
import type { Alignment } from "@/core/types";
import { type StructureDeletionRefusal, useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { usePaneEntered } from "@/ui/workspace/use-pane-entry";
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

// Why a structural delete was refused. Keyed by the store's refusal so a new
// reason cannot be added without a message to show for it.
const structureRefusalMessage: Record<StructureDeletionRefusal, string> = {
	"last-row": copy.disabled.lastRemainingRow,
	"last-column": copy.disabled.lastRemainingColumn,
	"header-row": copy.disabled.headerRowRequired,
};

const alignmentIcon = {
	default: AlignJustify,
	left: AlignLeft,
	center: AlignCenter,
	right: AlignRight,
} satisfies Record<Alignment, typeof AlignLeft>;

// The next cell in reading order, or nothing when there is none. This is how
// Tab knows it has reached an edge and should let focus leave the grid.
//
// Reading order starts at the header row, so the walk is offset by one row: a
// grid of N data rows exposes N + 1 rows of cells.
function adjacentCell(
	from: CellPosition,
	direction: 1 | -1,
	rows: number,
	columns: number,
): CellPosition {
	const total = (rows + 1) * columns;
	const index =
		((from.row - HEADER_ROW) * columns + from.column + direction + total) %
		total;
	return {
		row: Math.floor(index / columns) + HEADER_ROW,
		column: index % columns,
	};
}

export function TableGrid({ zoom }: { readonly zoom: number }) {
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);
	const editing = useTabeloStore((state) => state.editing);
	const editingSeed = useTabeloStore((state) => state.editingSeed);
	const editingHeader = useTabeloStore((state) => state.editingHeader);
	const entered = usePaneEntered();

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

	// A column selection starts on the header row, because a column is its header
	// plus its cells.
	const selectColumn = useCallback((column: number, extend: boolean) => {
		const store = useTabeloStore.getState();
		if (!extend) {
			store.selectCell({ row: HEADER_ROW, column }, "column");
			return;
		}

		const anchorColumn =
			store.selection.mode === "column"
				? store.selection.anchor.column
				: store.selection.focus.column;
		store.setSelection({
			anchor: { row: HEADER_ROW, column: anchorColumn },
			focus: { row: HEADER_ROW, column },
			mode: "column",
		});
	}, []);

	const moveFocus = useCallback(
		(rowDelta: number, columnDelta: number, extend: boolean) => {
			const store = useTabeloStore.getState();
			const next = {
				// The floor is the header row: arrows and Shift+arrows reach it, and
				// stop there rather than wrapping or escaping the grid.
				row: Math.max(
					HEADER_ROW,
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

	// Editing a header cell is editing the header, but from the keyboard's point
	// of view it is the same gesture as editing any cell: Enter, F2, or just
	// typing. One entry point keeps the two rows behaving alike.
	const beginEditing = useCallback((at: CellPosition, seed?: string) => {
		const store = useTabeloStore.getState();
		if (at.row === HEADER_ROW) store.setEditingHeader(at.column, seed);
		else store.setEditing(at, seed);
	}, []);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
		const store = useTabeloStore.getState();
		if (store.editing || store.editingHeader !== null) return;

		// The grid's keyboard model belongs to its cells. The chrome around them
		// holds real controls: the row and column select handles and their menu
		// triggers, and a key pressed on one of those is that control's own.
		// Without this the printable-character branch below would swallow Space
		// and the handles could never be activated from the keyboard.
		const target = event.target as HTMLElement | null;
		if (target && !target.closest("[data-cell]")) return;

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
				const next = adjacentCell(
					selection.focus,
					event.shiftKey ? -1 : 1,
					store.document.rows.length,
					store.document.columns.length,
				);
				event.preventDefault();
				store.selectCell(next);
				return;
			}
			case "Home":
				event.preventDefault();
				store.selectCell({
					row: mod ? HEADER_ROW : selection.focus.row,
					column: 0,
				});
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
				else beginEditing(selection.focus);
				return;
			case "F2":
				event.preventDefault();
				beginEditing(selection.focus);
				return;
			case "Escape":
				// Close the innermost thing first: if the selection spans multiple
				// cells, collapse it. If it is already a single cell, let the event
				// bubble so the pane frame can exit.
				if (
					selection.anchor.row !== selection.focus.row ||
					selection.anchor.column !== selection.focus.column
				) {
					event.preventDefault();
					store.selectCell(selection.focus);
				}
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
						store.pushNotice({
							severity: "warning",
							message: structureRefusalMessage[refusal],
						});
					}
				} else store.clearSelection();
				return;
			default:
				break;
		}

		// Select-all covers every column, and a column includes its header, so the
		// highlight and the next keystroke agree about the header row.
		if (mod && event.key.toLowerCase() === "a") {
			event.preventDefault();
			store.setSelection({
				anchor: { row: HEADER_ROW, column: 0 },
				focus: {
					row: HEADER_ROW,
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
			beginEditing(selection.focus, event.key);
		}
	};

	const selectedMatrix = () => useTabeloStore.getState().selectedMatrix();

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
					{/* The column index strip. It is chrome, like the row-number gutter
					    it mirrors, so role="presentation" keeps it out of the grid's row
					    semantics: it must not count toward aria-rowcount or shift
					    aria-rowindex. Presentation rather than aria-hidden, because the
					    controls it holds have to stay reachable: aria-hidden would remove
					    its descendants from the tree, taking column selection and the
					    column menu with them. The lint rule reads a <tr> inside
					    role="grid" as interactive; removing a chrome row from the row
					    semantics is what role="presentation" is for. See §9. */}
					{/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: see above */}
					<tr role="presentation">
						{/* Where the letters meet the row numbers is a dead corner, not a
						    control. */}
						<td
							role="presentation"
							className="sticky top-0 left-0 z-30 h-grid-strip border-line-strong border-r border-b bg-surface-header"
						/>
						{document.columns.map((column, columnIndex) => (
							<ColumnIndexCell
								key={column.id}
								columnIndex={columnIndex}
								header={column.header}
								selected={rectContains(rect, HEADER_ROW, columnIndex)}
								focused={selection.focus.column === columnIndex}
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

					<tr
						// biome-ignore lint/a11y/noRedundantRoles: see the tbody rows
						role="row"
						aria-rowindex={1}
						className="group/row"
					>
						<th
							scope="row"
							// biome-ignore lint/a11y/noRedundantRoles: see the tbody rows
							role="rowheader"
							aria-label={copy.a11y.headerRow}
							// Right-clicking row 1 offers row actions like any other row.
							// Before the strip existed this lookup found nothing and the
							// menu fell through to cell actions on a non-cell.
							data-row-header={HEADER_ROW}
							className={cn(
								"sticky left-0 z-30 border-line-strong border-r border-b bg-surface-header",
								"px-1 text-center font-index font-semibold text-foreground text-xs tabular-nums",
								"top-grid-strip",
							)}
						>
							<div className="flex items-center justify-between gap-0.5">
								<span>1</span>
								<AxisMenu
									axis="row"
									index={HEADER_ROW}
									revealed={selection.focus.row === HEADER_ROW}
								/>
							</div>
						</th>
						{document.columns.map((column, columnIndex) => (
							<HeaderCell
								key={column.id}
								columnIndex={columnIndex}
								header={column.header}
								align={column.align}
								selected={rectContains(rect, HEADER_ROW, columnIndex)}
								focus={
									selection.focus.row === HEADER_ROW &&
									selection.focus.column === columnIndex
								}
								editing={editingHeader === columnIndex}
								seed={editingSeed}
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
								// biome-ignore lint/a11y/noRedundantRoles: see above
								role="rowheader"
								// The heading a screen reader reads as the row context for
								// every cell beside it, so it names the row rather than
								// concatenating the two controls it contains.
								aria-label={copy.a11y.rowNumber(rowIndex)}
								data-row-header={rowIndex}
								className={cn(
									"sticky left-0 z-10 border-line-subtle border-r border-b bg-surface-gutter",
									"px-1 text-center font-index font-normal text-muted-foreground text-xs tabular-nums",
									selection.mode === "row" &&
										rectContains(rect, rowIndex, 0) &&
										"bg-selection-fill text-foreground",
								)}
							>
								<div className="flex items-center justify-between gap-0.5">
									<button
										type="button"
										tabIndex={entered ? 0 : -1}
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
										data-grid-active={isFocus ? "true" : undefined}
										tabIndex={isFocus && entered ? 0 : -1}
										aria-selected={inSelection}
										aria-colindex={columnIndex + 1}
										// Deliberately unlabelled: the cell's name is its value,
										// and the row and column headers supply the rest. An
										// aria-label here would replace the content with
										// coordinates and repeat them on every arrow key.
										title={value || undefined}
										className={cn(
											"relative overflow-hidden border-line-subtle border-r border-b px-2 align-top",
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
											<span className="block h-content-line-box overflow-hidden whitespace-pre leading-content-line-box">
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

// One cell of the column index strip. It carries the column's positional
// letter, which for an unnamed column is the only identity it has, and it owns
// every affordance that used to crowd the header text: selection, the column
// menu, and the resize handle.
interface ColumnIndexCellProps {
	readonly columnIndex: number;
	readonly header: string;
	readonly selected: boolean;
	// The column the user is working in, which is where its actions appear.
	readonly focused: boolean;
	// The stored width is in rem. Zoom scales what is rendered, so the drag
	// gesture converts viewport pixels back before writing a width down.
	readonly width: number;
	readonly zoom: number;
	readonly onSelect: (extend: boolean) => void;
	readonly onDragStart: () => void;
	readonly onDragEnter: () => void;
}

function ColumnIndexCell({
	columnIndex,
	header,
	selected,
	focused,
	width,
	zoom,
	onSelect,
	onDragStart,
	onDragEnter,
}: ColumnIndexCellProps) {
	const resizeState = useRef<{
		startX: number;
		startWidth: number;
		rootFontSize: number;
	} | null>(null);
	const letter = copy.a11y.columnLetter(columnIndex);
	const entered = usePaneEntered();

	return (
		<td
			role="presentation"
			data-column-header={columnIndex}
			data-column-letter={letter}
			// `sticky` already establishes the containing block the resize handle
			// positions against, so no `relative` here: it would win over `sticky`
			// and turn the offset into a shift rather than a scroll threshold.
			className={cn(
				"group/col sticky top-0 z-20 h-grid-strip border-line-strong border-r border-b",
				"px-1 text-center font-index font-normal text-muted-foreground text-xs",
				selected ? "bg-selection-fill text-foreground" : "bg-surface-header",
			)}
			onPointerEnter={onDragEnter}
		>
			<div className="flex items-center justify-between gap-0.5">
				{/* The handle for the whole column. It names itself after the column it
				    selects, falling back to the letter when the header is empty, which
				    is the same rule the header cell announces by. */}
				<button
					type="button"
					tabIndex={entered ? 0 : -1}
					aria-label={`${copy.actions.selectColumn}: ${copy.a11y.columnHeader(header, columnIndex)}`}
					className="min-w-0 flex-1 cursor-pointer truncate rounded-interactive px-1 hover:text-foreground"
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						onDragStart();
						onSelect(event.shiftKey || event.metaKey || event.ctrlKey);
					}}
					onClick={(event) => {
						// A keyboard-generated click has no pointer detail.
						if (event.detail === 0) onSelect(event.shiftKey);
					}}
				>
					{letter}
				</button>
				<AxisMenu axis="column" index={columnIndex} revealed={focused} />
			</div>

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
		</td>
	);
}

// The header cell holds editable text and the alignment indicator, and nothing
// else. Selecting the column and opening its menu belong to the index strip
// above, so this behaves like the data cells below it: click to select, double
// click or F2 to edit, Backspace to clear.
interface HeaderCellProps {
	readonly columnIndex: number;
	readonly header: string;
	readonly align: Alignment;
	readonly selected: boolean;
	readonly focus: boolean;
	readonly editing: boolean;
	// The character that opened the editor, when typing is what opened it.
	readonly seed: string | null;
}

function HeaderCell({
	columnIndex,
	header,
	align,
	selected,
	focus,
	editing,
	seed,
}: HeaderCellProps) {
	const AlignmentIcon = alignmentIcon[align];
	const entered = usePaneEntered();

	return (
		<th
			scope="col"
			// biome-ignore lint/a11y/noRedundantRoles: see the tbody rows
			role="columnheader"
			// The name a screen reader reads as the column context for every cell
			// below it. An empty header falls back to its letter from the strip, so
			// the announcement is never silent and no content is invented.
			aria-label={copy.a11y.columnHeader(header, columnIndex)}
			aria-colindex={columnIndex + 1}
			aria-selected={selected}
			// Address as a cell, because it is one for selection purposes: this is
			// what lets arrows, Shift+arrows, Tab, and the focus effect treat the
			// header row like any other row.
			data-cell={`${HEADER_ROW}:${columnIndex}`}
			data-grid-active={focus ? "true" : undefined}
			tabIndex={focus && entered ? 0 : -1}
			className={cn(
				"sticky z-20 overflow-hidden border-line-strong border-r border-b",
				"cursor-cell select-none px-2 font-semibold",
				// Sticks below the index strip rather than at the very top, so the
				// two chrome layers stack instead of covering one another.
				"top-grid-strip",
				alignClass[align],
				selected ? "bg-selection-fill" : "bg-surface-header",
				focus && "outline-2 outline-selection-edge -outline-offset-2",
			)}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				// A <th> is not focusable by default, so without this the browser's
				// own mousedown handling moves focus to <body> after ours runs and
				// the cell would look selected while ignoring every keystroke.
				event.preventDefault();
				const store = useTabeloStore.getState();
				if (event.shiftKey) {
					store.extendSelection({ row: HEADER_ROW, column: columnIndex });
				} else {
					store.selectCell({ row: HEADER_ROW, column: columnIndex });
				}
				event.currentTarget.focus();
			}}
			onDoubleClick={() =>
				useTabeloStore.getState().setEditingHeader(columnIndex)
			}
		>
			{editing ? (
				<CellEditor
					initialValue={seed ?? header}
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
					<span className="min-w-0 flex-1 truncate">{header}</span>
					<AlignmentIcon
						aria-hidden
						className="size-3.5 shrink-0 text-muted-foreground"
					/>
				</div>
			)}
		</th>
	);
}
