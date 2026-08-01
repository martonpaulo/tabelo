import { cn } from "@tabelo/ui/lib/utils";

interface MenuOptionProps {
	readonly label: string;
	readonly description?: string;
	readonly className?: string;
}

// One visual hierarchy for choices that need a primary label and supporting
// copy. The menu primitive owns interaction; this component owns text rhythm.
export function MenuOption({ label, description, className }: MenuOptionProps) {
	return (
		<span className={cn("grid min-w-0 flex-1 gap-0.5", className)}>
			<span data-slot="menu-option-label" className="block font-medium">
				{label}
			</span>
			{description ? (
				<span
					data-slot="menu-option-description"
					className="block text-muted-foreground text-xs"
				>
					{description}
				</span>
			) : null}
		</span>
	);
}
