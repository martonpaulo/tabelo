import { cn } from "@tabelo/ui/lib/utils";
import type { CellValueType } from "./cell-type";
import { cellTypeOptions } from "./cell-type-options";

interface CellTypeMarkProps {
	readonly type: CellValueType;
	readonly context: "cell" | "column";
	readonly className?: string;
}

// The type drawn as the same symbol its menu choice wears, rather than as an
// abbreviation, so a column header, a cell, and the Cell type menu all say it
// one way (owner, 2026-09-19). Decorative: the cell and the column already
// name their type to assistive technology.
export function CellTypeMark({ type, context, className }: CellTypeMarkProps) {
	const Icon = cellTypeOptions.find((option) => option.value === type)?.icon;
	return (
		<span
			aria-hidden="true"
			data-cell-type-mark={type}
			data-cell-type-mark-context={context}
			className={cn(
				"pointer-events-none inline-flex shrink-0 items-center text-muted-foreground",
				// A small symbol keeps a heavier stroke: at the product's 1.5 on a
				// 24-unit icon, a 0.75rem mark draws lines under one device pixel
				// wide, which blur on a 1x display (owner, 2026-09-19).
				"[--icon-stroke-width:2]",
				// Sized by the font size the zoom-aware utility inlines: a bare
				// var() reference to the theme token resolves at the root, where
				// no pane zoom exists, so the symbol would ignore the pane's zoom.
				context === "cell"
					? "h-content-line-box text-cell-type-mark [&_svg]:size-[1em]"
					: "[&_svg]:size-3.5",
				className,
			)}
		>
			{Icon ? <Icon /> : null}
		</span>
	);
}
