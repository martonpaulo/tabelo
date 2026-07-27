import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	ArrowDown,
	ArrowUp,
	Copy,
	Eraser,
	MoreVertical,
	Plus,
	Trash2,
} from "lucide-react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// Mirrors ColumnMenu deliberately: same depth, same ordering, same wording.
// Row and column actions should never feel like two different systems.

export function RowMenu({ index }: { readonly index: number }) {
	const store = useTabeloStore();
	const canDelete = store.document.rows.length > 1;

	const select = () => store.selectCell({ row: index, column: 0 }, "row");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`${copy.actions.rowActions}: ${copy.a11y.rowNumber(index)}`}
				className="inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-popup-open:opacity-100"
				onClick={select}
			>
				<MoreVertical aria-hidden className="size-3.5" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" className="w-auto min-w-48">
				<DropdownMenuItem onClick={() => store.addRow(index + 1)}>
					<Plus aria-hidden />
					{copy.actions.addRow}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => {
						select();
						store.duplicateSelectedRows();
					}}
				>
					<Copy aria-hidden />
					{copy.actions.duplicate}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => {
						select();
						store.clearSelection();
					}}
				>
					<Eraser aria-hidden />
					{copy.actions.clear}
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					disabled={index === 0}
					onClick={() => {
						select();
						store.moveSelectedRow(-1);
					}}
				>
					<ArrowUp aria-hidden />
					{copy.actions.moveUp}
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={index >= store.document.rows.length - 1}
					onClick={() => {
						select();
						store.moveSelectedRow(1);
					}}
				>
					<ArrowDown aria-hidden />
					{copy.actions.moveDown}
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					variant="destructive"
					disabled={!canDelete}
					onClick={() => {
						select();
						store.removeSelectedRows();
					}}
				>
					<Trash2 aria-hidden />
					{copy.actions.deleteRows}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
