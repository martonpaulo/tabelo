import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import {
	controlStateTransitionStyles,
	switchThumbTransitionStyles,
} from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// An on/off setting that takes effect at once. Off is an outlined track with
// the thumb at the start, on is the solid primary with the thumb at the end:
// the position carries the state, and the outline keeps the control's edge at
// the contrast a control boundary needs.
//
// The anatomy is one decision at two sizes. `default` is the Settings control;
// `menu` is the same switch drawn as a menu's on/off indicator, which is not a
// control of its own: its item owns the state, so the indicator is a Base UI
// item indicator that carries the item's `data-checked`. Both read the state
// from the track through the `switch` group, so the thumb never needs its own.
const switchTrackVariants = cva(
	"group/switch border-control-outline data-checked:border-primary data-checked:bg-primary relative inline-flex shrink-0 items-center rounded-full border bg-transparent",
	{
		variants: {
			size: {
				default: "h-5 w-9",
				menu: "h-4 w-7",
			},
		},
		defaultVariants: { size: "default" },
	},
);

const switchThumbVariants = cva(
	`bg-control-outline group-data-checked/switch:bg-primary-foreground pointer-events-none block translate-x-0.5 rounded-full ${switchThumbTransitionStyles}`,
	{
		variants: {
			size: {
				default: "size-3.5 group-data-checked/switch:translate-x-4.5",
				menu: "size-2.5 group-data-checked/switch:translate-x-3.5",
			},
		},
		defaultVariants: { size: "default" },
	},
);

function Switch({
	className,
	size = "default",
	...props
}: SwitchPrimitive.Root.Props & VariantProps<typeof switchTrackVariants>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				switchTrackVariants({ size }),
				"cursor-pointer data-disabled:cursor-not-allowed data-disabled:opacity-50",
				controlStateTransitionStyles,
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={switchThumbVariants({ size })}
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch, switchThumbVariants, switchTrackVariants };
