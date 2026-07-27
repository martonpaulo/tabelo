import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	ArrowLeft,
	ArrowRight,
	ChevronDown,
	Copy,
	Plus,
	Trash2,
} from "lucide-react";
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// Column actions live on the column itself. Everything here is one click deep
// — no submenus — because hunting through nested menus is exactly the friction
// this product is supposed to avoid.

const alignments: {
	value: Alignment;
	label: string;
	icon: typeof AlignLeft;
}[] = [
	{ value: "default", label: copy.actions.alignDefault, icon: AlignJustify },
	{ value: "left", label: copy.actions.alignLeft, icon: AlignLeft },
	{ value: "center", label: copy.actions.alignCenter, icon: AlignCenter },
	{ value: "right", label: copy.actions.alignRight, icon: AlignRight },
];

export function ColumnMenu({ index }: { readonly index: number }) {
	const store = useTabeloStore();
	const column = store.document.columns[index];
	const canDelete = store.document.columns.length > 1;

	const select = () => store.selectCell({ row: 0, column: index }, "column");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`${copy.actions.columnActions}: ${column?.header ?? ""}`}
				className="inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 group-hover/col:opacity-100 data-popup-open:opacity-100"
				onClick={select}
			>
				<ChevronDown aria-hidden className="size-3.5" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-48">
				<DropdownMenuLabel>{copy.actions.alignment}</DropdownMenuLabel>
				{alignments.map((option) => (
					<DropdownMenuItem
						key={option.value}
						onClick={() => store.setColumnAlignment(index, option.value)}
						className={
							column?.align === option.value ? "bg-accent/60" : undefined
						}
					>
						<option.icon aria-hidden />
						{option.label}
					</DropdownMenuItem>
				))}

				<DropdownMenuSeparator />

				<DropdownMenuItem onClick={() => store.addColumn(index)}>
					<Plus aria-hidden />
					{copy.actions.addColumn}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => {
						select();
						store.duplicateSelectedColumns();
					}}
				>
					<Copy aria-hidden />
					{copy.actions.duplicate}
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					disabled={index === 0}
					onClick={() => {
						select();
						store.moveSelectedColumn(-1);
					}}
				>
					<ArrowLeft aria-hidden />
					{copy.actions.moveLeft}
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={index >= store.document.columns.length - 1}
					onClick={() => {
						select();
						store.moveSelectedColumn(1);
					}}
				>
					<ArrowRight aria-hidden />
					{copy.actions.moveRight}
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					variant="destructive"
					disabled={!canDelete}
					onClick={() => {
						select();
						store.removeSelectedColumns();
					}}
				>
					<Trash2 aria-hidden />
					{copy.actions.deleteColumns}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
