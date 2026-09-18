import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";

// One value out of a few short, mutually exclusive ones, laid side by side. It
// is a radio group underneath, so it keeps radio semantics and arrow-key
// movement; only the drawing is a row of segments. The chosen segment wears
// the same solid primary as a chosen option block.
function SegmentedControl({ className, ...props }: RadioGroupPrimitive.Props) {
	return (
		<RadioGroupPrimitive
			data-slot="segmented-control"
			className={cn(
				"grid auto-cols-fr grid-flow-col gap-0.5 rounded-interactive bg-surface-app p-0.5",
				className,
			)}
			{...props}
		/>
	);
}

function SegmentedControlItem({
	className,
	...props
}: RadioPrimitive.Root.Props) {
	return (
		<RadioPrimitive.Root
			data-slot="segmented-control-item"
			className={cn(
				"flex min-h-control-sm cursor-pointer items-center justify-center rounded-indicator px-2 py-1 text-center text-muted-foreground text-xs leading-tight not-data-checked:hover:bg-accent not-data-checked:hover:text-accent-foreground data-disabled:cursor-not-allowed data-checked:bg-primary data-checked:text-primary-foreground data-disabled:opacity-50",
				controlStateTransitionStyles,
				className,
			)}
			{...props}
		/>
	);
}

export { SegmentedControl, SegmentedControlItem };
