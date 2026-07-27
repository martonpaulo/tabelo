import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	ClipboardPaste,
	Copy,
	Eraser,
	Plus,
	Scissors,
	Trash2,
} from "lucide-react";
import { matrixToHtml, matrixToTsv } from "@/clipboard/serialize";
import { selectionRect } from "@/core/selection";
import { readClipboardTable, writeClipboardTable } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { ToolbarButton, ToolbarDivider } from "@/ui/primitives/toolbar-button";

// The toolbar follows the selection: when columns are selected it offers
// column actions, otherwise row actions. Same count of buttons either way, in
// the same positions, so nothing jumps — see docs/design-system.md §5.

export function GridToolbar() {
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);

	const rect = selectionRect(
		selection,
		document.rows.length,
		document.columns.length,
	);
	const columnMode = selection.mode === "column";

	const rows = rect.bottom - rect.top + 1;
	const columns = rect.right - rect.left + 1;

	const copySelection = async () => {
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
		const matrix =
			store.selection.mode === "column"
				? [
						store.document.columns
							.slice(current.left, current.right + 1)
							.map((c) => c.header),
						...body,
					]
				: body;

		const ok = await writeClipboardTable(
			matrixToTsv(matrix),
			matrixToHtml(matrix),
		);
		if (ok) useTabeloStore.setState({ notice: copy.notices.copied });
		return ok;
	};

	return (
		<>
			<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
				{copy.a11y.selectionSummary(rows, columns)}
			</span>

			<ToolbarDivider />

			<ToolbarButton
				icon={Plus}
				label={columnMode ? copy.actions.addColumn : copy.actions.addRow}
				onClick={() =>
					columnMode
						? useTabeloStore.getState().addColumn()
						: useTabeloStore.getState().addRow()
				}
			/>
			<ToolbarButton
				icon={Copy}
				label={copy.actions.duplicate}
				iconOnly
				onClick={() =>
					columnMode
						? useTabeloStore.getState().duplicateSelectedColumns()
						: useTabeloStore.getState().duplicateSelectedRows()
				}
			/>
			<ToolbarButton
				icon={columnMode ? ArrowLeft : ArrowUp}
				label={columnMode ? copy.actions.moveLeft : copy.actions.moveUp}
				iconOnly
				disabled={columnMode ? rect.left === 0 : rect.top === 0}
				onClick={() =>
					columnMode
						? useTabeloStore.getState().moveSelectedColumn(-1)
						: useTabeloStore.getState().moveSelectedRow(-1)
				}
			/>
			<ToolbarButton
				icon={columnMode ? ArrowRight : ArrowDown}
				label={columnMode ? copy.actions.moveRight : copy.actions.moveDown}
				iconOnly
				disabled={
					columnMode
						? rect.right >= document.columns.length - 1
						: rect.bottom >= document.rows.length - 1
				}
				onClick={() =>
					columnMode
						? useTabeloStore.getState().moveSelectedColumn(1)
						: useTabeloStore.getState().moveSelectedRow(1)
				}
			/>
			<ToolbarButton
				icon={Eraser}
				label={copy.actions.clear}
				iconOnly
				onClick={() => useTabeloStore.getState().clearSelection()}
			/>
			<ToolbarButton
				icon={Trash2}
				label={
					columnMode ? copy.actions.deleteColumns : copy.actions.deleteRows
				}
				iconOnly
				variant="ghost"
				disabled={
					columnMode ? document.columns.length <= 1 : document.rows.length <= 1
				}
				onClick={() =>
					columnMode
						? useTabeloStore.getState().removeSelectedColumns()
						: useTabeloStore.getState().removeSelectedRows()
				}
			/>

			<ToolbarDivider />

			<ToolbarButton
				icon={Copy}
				label={copy.actions.copy}
				iconOnly
				onClick={copySelection}
			/>
			<ToolbarButton
				icon={Scissors}
				label={copy.actions.cut}
				iconOnly
				onClick={async () => {
					if (await copySelection()) useTabeloStore.getState().clearSelection();
				}}
			/>
			<ToolbarButton
				icon={ClipboardPaste}
				label={copy.actions.paste}
				iconOnly
				onClick={async () => {
					const payload = await readClipboardTable();
					if (payload) useTabeloStore.getState().pasteClipboard(payload);
				}}
			/>
		</>
	);
}
