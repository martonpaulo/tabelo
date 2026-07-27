import { Button } from "@tabelo/ui/components/button";
import { Separator } from "@tabelo/ui/components/separator";
import type { LucideIcon } from "lucide-react";

// Every action bar in the app uses this one shape, so an action never looks
// different depending on where it sits. It composes the shadcn Button rather
// than restyling a bare element — see docs/design-system.md §3.

interface ToolbarButtonProps
	extends Omit<React.ComponentProps<typeof Button>, "children"> {
	readonly icon: LucideIcon;
	readonly label: string;
	// Icon-only is allowed only where a label genuinely cannot fit; the label is
	// still the accessible name. See docs/design-system.md §6.
	readonly iconOnly?: boolean;
	readonly shortcut?: string;
}

export function ToolbarButton({
	icon: Icon,
	label,
	iconOnly = false,
	shortcut,
	variant = "ghost",
	size,
	...props
}: ToolbarButtonProps) {
	return (
		<Button
			variant={variant}
			size={size ?? (iconOnly ? "icon-sm" : "sm")}
			aria-label={label}
			title={shortcut ? `${label} (${shortcut})` : label}
			{...props}
		>
			<Icon aria-hidden />
			{iconOnly ? null : <span>{label}</span>}
		</Button>
	);
}

export function ToolbarDivider() {
	return <Separator orientation="vertical" className="mx-1 h-4" />;
}
