import { cn } from "@tabelo/ui/lib/utils";

interface MenuOptionProps {
	readonly label: string;
	readonly description?: string;
	readonly className?: string;
	// Ids for a control elsewhere that names or describes itself by this text.
	readonly labelId?: string;
	readonly descriptionId?: string;
	// A label that is user content, such as the table's name, stays on one
	// line and ellipsizes instead of wrapping.
	readonly truncateLabel?: boolean;
}

// One visual hierarchy for choices that need a primary label and supporting
// copy. The menu primitive owns interaction; this component owns text rhythm.
export function MenuOption({
	label,
	description,
	className,
	labelId,
	descriptionId,
	truncateLabel = false,
}: MenuOptionProps) {
	return (
		<span className={cn("grid min-w-0 flex-1 gap-0.5", className)}>
			<span
				id={labelId}
				data-slot="menu-option-label"
				className={cn("block font-medium", truncateLabel && "truncate")}
			>
				{label}
			</span>
			{description ? (
				<span
					id={descriptionId}
					data-slot="menu-option-description"
					className="block text-muted-foreground text-xs"
				>
					{description}
				</span>
			) : null}
		</span>
	);
}
