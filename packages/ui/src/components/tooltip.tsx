"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { popupTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";

function TooltipProvider({
	delay = 0,
	...props
}: TooltipPrimitive.Provider.Props) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delay={delay}
			{...props}
		/>
	);
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
	return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	side = "top",
	sideOffset = 4,
	align = "center",
	alignOffset = 0,
	children,
	...props
}: TooltipPrimitive.Popup.Props &
	Pick<
		TooltipPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
				className="isolate z-50"
			>
				<TooltipPrimitive.Popup
					data-slot="tooltip-content"
					role="tooltip"
					className={cn(
						"z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-interactive bg-popover px-3 py-1.5 text-popover-foreground text-xs shadow-xl ring-1 ring-line-floating has-data-[slot=kbd]:pr-1.5",
						popupTransitionStyles,
						className,
					)}
					{...props}
				>
					{children}
					<TooltipPrimitive.Arrow className="relative z-50 block h-1.5 w-3 overflow-clip before:absolute before:bottom-0 before:left-1/2 before:size-2 before:-translate-x-1/2 before:translate-y-1/2 before:rotate-45 before:border before:border-line-floating before:bg-popover before:content-[''] data-[side=bottom]:-top-1.5 data-[side=left]:-right-[0.5625rem] data-[side=top]:-bottom-1.5 data-[side=right]:-left-[0.5625rem] data-[side=left]:rotate-90 data-[side=right]:-rotate-90 data-[side=top]:rotate-180" />
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
