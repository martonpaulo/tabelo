import { Label } from "@tabelo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@tabelo/ui/components/radio-group";
import { cn } from "@tabelo/ui/lib/utils";
import { type ReactNode, useId } from "react";
import { DisabledTooltip } from "./disabled-tooltip";

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
	disabledReason,
	children,
	accessory,
}: {
	readonly value: string;
	readonly selected: boolean;
	readonly disabledReason?: string;
	readonly children: ReactNode;
	readonly accessory?: ReactNode;
}) {
	const radioId = useId();
	const disabled = disabledReason !== undefined;

	return (
		<DisabledTooltip reason={disabledReason}>
			<Label
				htmlFor={radioId}
				data-selected={selected ? "true" : undefined}
				data-disabled={disabled ? "true" : undefined}
				className={cn(
					"flex min-h-control-md w-full items-start gap-3 rounded-interactive px-2 py-2 text-sm leading-snug",
					"hover:bg-muted data-[selected=true]:bg-selection-fill",
					"focus-within:outline-2 focus-within:outline-selection-edge focus-within:-outline-offset-2",
					"data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
				)}
			>
				<RadioGroupItem
					id={radioId}
					value={value}
					disabled={disabled}
					className="mt-0.5"
				/>
				<span className="min-w-0 flex-1">{children}</span>
				{accessory}
			</Label>
		</DisabledTooltip>
	);
}
