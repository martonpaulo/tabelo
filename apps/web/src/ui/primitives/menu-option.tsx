interface MenuOptionProps {
	readonly label: string;
	readonly description: string;
}

// One visual hierarchy for choices that need a primary label and supporting
// copy. The menu primitive owns interaction; this component owns text rhythm.
export function MenuOption({ label, description }: MenuOptionProps) {
	return (
		<span className="grid flex-1 gap-0.5">
			<span className="block font-medium">{label}</span>
			<span className="block text-muted-foreground text-xs">{description}</span>
		</span>
	);
}
