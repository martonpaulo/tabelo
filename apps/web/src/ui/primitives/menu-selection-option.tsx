import { DropdownMenuRadioItem } from "@tabelo/ui/components/dropdown-menu";
import type { ReactNode } from "react";
import { DisabledTooltip } from "./disabled-tooltip";
import {
	type SelectionOptionAvailability,
	SelectionOptionContent,
} from "./selection-option";

export function MenuSelectionOption({
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
			<DropdownMenuRadioItem
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
			</DropdownMenuRadioItem>
		</DisabledTooltip>
	);
}
