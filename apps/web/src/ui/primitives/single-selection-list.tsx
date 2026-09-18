import { Label } from "@tabelo/ui/components/label";
import {
	optionBlockStateStyles,
	optionBlockStyles,
} from "@tabelo/ui/components/menu-styles";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { RadioGroup, RadioGroupItem } from "@tabelo/ui/components/radio-group";
import { cn } from "@tabelo/ui/lib/utils";
import { useId } from "react";
import type { PreconditionRecovery } from "@/ui/precondition-recovery";
import { ControlTooltip } from "./control-tooltip";
import { RecoveryButton } from "./recovery-command";
import {
	CompactOptionContent,
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
	recovery,
	onRecover,
	icon,
	label,
	description,
	metadata,
	compact = false,
}: {
	readonly value: string;
	readonly selected: boolean;
	// A short choice drawn as a tile for a grid of options: icon and metadata on
	// top, the label under them, no description (the list shows the chosen
	// option's description once, below the grid).
	readonly compact?: boolean;
	readonly availability?: SelectionOptionContentProps["availability"];
	// The correction for a choice a precondition refused. It is a sibling of
	// the option, never part of it: the radio stays genuinely disabled and this
	// stays a separate enabled command. Absent when the refusal names no
	// position to go to.
	readonly recovery?: PreconditionRecovery;
	readonly onRecover?: () => void;
} & Omit<SelectionOptionContentProps, "availability">) {
	const radioId = useId();
	const disabled = availability !== undefined;

	const option = (
		<ControlTooltip reason={availability?.reason}>
			<Label
				htmlFor={radioId}
				data-selected={selected ? "true" : undefined}
				data-disabled={disabled ? "true" : undefined}
				data-availability={availability?.kind}
				className={cn(
					optionBlockStyles,
					controlStateTransitionStyles,
					optionBlockStateStyles,
					// Room at the trailing edge for the correction drawn over it.
					recovery && !compact && "pr-32",
					"focus-within:outline-(--focus-ring) focus-within:outline-2 focus-within:outline-offset-2",
				)}
			>
				{compact ? (
					<CompactOptionContent
						icon={icon}
						label={label}
						metadata={metadata}
						availability={availability}
					/>
				) : (
					<SelectionOptionContent
						icon={icon}
						label={label}
						description={description}
						metadata={metadata}
						availability={availability}
					/>
				)}
				<RadioGroupItem
					id={radioId}
					value={value}
					disabled={disabled}
					aria-description={availability?.reason}
					className="absolute inset-0 z-10 size-full cursor-pointer border-0 opacity-0 after:hidden focus-visible:ring-0 data-disabled:cursor-not-allowed data-disabled:opacity-0"
				/>
			</Label>
		</ControlTooltip>
	);

	if (!recovery) return option;

	// The correction is drawn inside the refused option's block, at its
	// trailing edge, so it reads as that option's own action (owner,
	// 2026-09-19). In the DOM it stays a sibling of the disabled radio, never
	// inside it, and sits above the radio's full-block hit area.
	return (
		<div className="relative" data-recovery-layout={compact ? "tile" : "row"}>
			{option}
			<div
				className={cn(
					"absolute z-20",
					compact ? "right-3 bottom-2" : "top-1/2 right-3 -translate-y-1/2",
				)}
			>
				<RecoveryButton
					recovery={recovery}
					target={label}
					onRun={() => onRecover?.()}
				/>
			</div>
		</div>
	);
}
