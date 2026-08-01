import { Label } from "@tabelo/ui/components/label";
import { dialogSingleSelectionItemStateStyles } from "@tabelo/ui/components/menu-styles";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { RadioGroup, RadioGroupItem } from "@tabelo/ui/components/radio-group";
import { cn } from "@tabelo/ui/lib/utils";
import { useId } from "react";
import { DisabledTooltip } from "./disabled-tooltip";
import {
	SelectionOptionContent,
	type SelectionOptionContentProps,
} from "./selection-option";

export const singleSelectionDialogContentStyles = "text-sm";

// One treatment for modal choices with exactly one current value. The radio
// primitive owns semantics and keyboard behaviour; this component makes the
// entire labelled row read as the option and gives selected, hover, focus, and
// disabled states the same geometry wherever the list appears.

export function SingleSelectionList({
	className,
	...props
}: React.ComponentProps<typeof RadioGroup>) {
	return <RadioGroup className={cn("gap-1.5", className)} {...props} />;
}

export function SingleSelectionOption({
	value,
	selected,
	availability,
	icon,
	label,
	description,
	metadata,
}: {
	readonly value: string;
	readonly selected: boolean;
	readonly availability?: SelectionOptionContentProps["availability"];
} & Omit<SelectionOptionContentProps, "availability">) {
	const radioId = useId();
	const disabled = availability !== undefined;

	return (
		<DisabledTooltip reason={availability?.reason}>
			<Label
				htmlFor={radioId}
				data-selected={selected ? "true" : undefined}
				data-disabled={disabled ? "true" : undefined}
				data-availability={availability?.kind}
				className={cn(
					"relative flex min-h-control-md w-full items-center gap-3 rounded-interactive px-2 py-2 text-sm leading-snug",
					controlStateTransitionStyles,
					dialogSingleSelectionItemStateStyles,
					"focus-within:outline-2 focus-within:outline-selection-edge focus-within:-outline-offset-2",
					"data-[disabled=true]:cursor-not-allowed data-[disabled=true]:hover:bg-transparent",
				)}
			>
				<SelectionOptionContent
					icon={icon}
					label={label}
					description={description}
					metadata={metadata}
					availability={availability}
				/>
				<RadioGroupItem
					id={radioId}
					value={value}
					disabled={disabled}
					aria-description={availability?.reason}
					className="absolute inset-0 z-10 size-full cursor-pointer border-0 opacity-0 after:hidden focus-visible:ring-0 data-disabled:cursor-not-allowed data-disabled:opacity-0"
				/>
			</Label>
		</DisabledTooltip>
	);
}
