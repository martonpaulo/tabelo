import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import {
	segmentedGroupStyles,
	segmentedItemStyles,
} from "@tabelo/ui/components/menu-styles";
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
			className={cn(segmentedGroupStyles, className)}
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
				segmentedItemStyles,
				controlStateTransitionStyles,
				className,
			)}
			{...props}
		/>
	);
}

export { SegmentedControl, SegmentedControlItem };
