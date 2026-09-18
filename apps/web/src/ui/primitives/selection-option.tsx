import { cn } from "@tabelo/ui/lib/utils";
import { IconAlertCircle, IconEye } from "@tabler/icons-react";
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
	const StatusIcon = unavailable ? IconAlertCircle : IconEye;
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
								"text-muted-foreground",
							)}
						>
							<StatusIcon
								aria-hidden
								className={cn("size-3.5", unavailable && "text-status-warning")}
							/>
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

// The same choice as a tile: the icon and its trailing metadata or status on
// one row, the label under them. For short choices laid out in a grid.
export function CompactOptionContent({
	icon,
	label,
	metadata,
	availability,
}: Omit<SelectionOptionContentProps, "description">) {
	const unavailable = availability?.kind === "unavailable";
	const StatusIcon = unavailable ? IconAlertCircle : IconEye;
	return (
		<span className="grid w-full min-w-0 gap-1">
			<span className="flex items-center justify-between gap-2">
				<span
					aria-hidden
					data-slot="selection-option-icon"
					className={cn(
						"flex size-6 shrink-0 items-center [&>svg:not([class*='size-'])]:size-5",
						availability && "opacity-50",
					)}
				>
					{icon}
				</span>
				<span className="flex items-center gap-2">
					{availability ? (
						<span
							data-availability={availability.kind}
							data-slot="selection-option-status"
							className={cn(
								"inline-flex items-center gap-1 text-xs",
								"text-muted-foreground",
							)}
						>
							<StatusIcon
								aria-hidden
								className={cn("size-3.5", unavailable && "text-status-warning")}
							/>
							<span>
								{unavailable
									? copy.disabled.unavailableStatus
									: copy.disabled.inUseStatus}
							</span>
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
			</span>
			<span
				data-slot="menu-option-label"
				className={cn("truncate font-medium", availability && "opacity-50")}
			>
				{label}
			</span>
		</span>
	);
}
