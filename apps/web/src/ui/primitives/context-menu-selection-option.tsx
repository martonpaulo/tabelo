import { ContextMenuRadioItem } from "@tabelo/ui/components/context-menu";
import type { ReactNode } from "react";
import { DisabledTooltip } from "./disabled-tooltip";
import {
	type SelectionOptionAvailability,
	SelectionOptionContent,
} from "./selection-option";

export function ContextMenuSelectionOption({
	value,
	icon,
	label,
	description,
	metadata,
	availability,
}: {
	readonly value: string;
	readonly icon: ReactNode;
	readonly label: string;
	readonly description?: string;
	readonly metadata?: string;
	readonly availability?: SelectionOptionAvailability;
}) {
	return (
		<DisabledTooltip reason={availability?.reason}>
			<ContextMenuRadioItem
				value={value}
				hideIndicator
				disabled={availability !== undefined}
				aria-description={availability?.reason}
				closeOnClick
				className="data-disabled:opacity-100"
			>
				<SelectionOptionContent
					icon={icon}
					label={label}
					description={description}
					metadata={metadata}
					availability={availability}
				/>
			</ContextMenuRadioItem>
		</DisabledTooltip>
	);
}
