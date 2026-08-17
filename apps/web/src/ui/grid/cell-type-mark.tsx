import { cn } from "@tabelo/ui/lib/utils";
import { CELL_TYPE_MARKS, type CellValueType } from "./cell-type";

interface CellTypeMarkProps {
	readonly type: CellValueType;
	readonly context: "cell" | "column";
	readonly className?: string;
}

export function CellTypeMark({ type, context, className }: CellTypeMarkProps) {
	return (
		<span
			aria-hidden="true"
			data-cell-type-mark={type}
			data-cell-type-mark-context={context}
			className={cn(
				"pointer-events-none font-medium font-sans text-muted-foreground",
				context === "cell"
					? "shrink-0 text-cell-type-mark leading-content-line-box"
					: "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs",
				className,
			)}
		>
			{CELL_TYPE_MARKS[type]}
		</span>
	);
}
