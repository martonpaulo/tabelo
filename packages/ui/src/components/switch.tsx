import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";

// An on/off setting that takes effect at once. Off is an outlined track with
// the thumb at the start, on is the solid primary with the thumb at the end:
// the position carries the state, and the outline keeps the control's edge at
// the contrast a control boundary needs.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-control-outline bg-transparent data-disabled:cursor-not-allowed data-checked:border-primary data-checked:bg-primary data-disabled:opacity-50",
				controlStateTransitionStyles,
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-control-outline data-checked:translate-x-4.5 data-checked:bg-primary-foreground",
					"transition-transform duration-100 ease-out",
				)}
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
