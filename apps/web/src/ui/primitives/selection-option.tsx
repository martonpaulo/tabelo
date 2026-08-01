import { cn } from "@tabelo/ui/lib/utils";
import { CircleAlert, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/copy/copy";
import { MenuOption } from "./menu-option";

export interface SelectionOptionAvailability {
	readonly kind: "in-use" | "unavailable";
	readonly reason: string;
}

export interface SelectionOptionContentProps {
	readonly icon: ReactNode;
	readonly label: string;
	readonly description?: string;
	readonly metadata?: string;
	readonly availability?: SelectionOptionAvailability;
}

// Menus and dialogs use different interaction primitives, but every choice has
// the same readable anatomy. Availability is deliberately content here, not a
// feature-specific decoration, so "already used" cannot drift into the same
// visual state as "cannot be used".
export function SelectionOptionContent({
	icon,
	label,
	description,
	metadata,
	availability,
}: SelectionOptionContentProps) {
	const unavailable = availability?.kind === "unavailable";
	const StatusIcon = unavailable ? CircleAlert : Eye;
	const statusLabel = unavailable
		? copy.disabled.unavailableStatus
		: copy.disabled.inUseStatus;

	return (
		<>
			<span
				aria-hidden
				data-slot="selection-option-icon"
				className={cn(
					"flex size-6 shrink-0 items-center justify-center [&>svg:not([class*='size-'])]:size-4",
					availability && "opacity-50",
				)}
			>
				{icon}
			</span>
			<MenuOption
				label={label}
				description={description}
				className={cn(availability && "opacity-50")}
			/>
			{metadata || availability ? (
				<span
					data-slot="selection-option-trailing"
					className="grid shrink-0 justify-items-end gap-0.5"
				>
					{availability ? (
						<span
							data-availability={availability.kind}
							data-slot="selection-option-status"
							className={cn(
								"inline-flex items-center gap-1 text-xs",
								unavailable ? "text-destructive/70" : "text-muted-foreground",
							)}
						>
							<StatusIcon aria-hidden className="size-3.5" />
							<span>{statusLabel}</span>
						</span>
					) : null}
					{metadata ? (
						<span
							data-slot="selection-option-metadata"
							className={cn(
								"text-muted-foreground text-xs",
								availability && "opacity-50",
							)}
						>
							{metadata}
						</span>
					) : null}
				</span>
			) : null}
		</>
	);
}
