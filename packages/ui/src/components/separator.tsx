import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@tabelo/ui/lib/utils";

function Separator({
	className,
	orientation = "horizontal",
	...props
}: SeparatorPrimitive.Props) {
	return (
		<SeparatorPrimitive
			data-slot="separator"
			orientation={orientation}
			className={cn(
				"shrink-0 bg-border data-horizontal:h-[0.0625rem] data-horizontal:w-full data-vertical:w-[0.0625rem] data-vertical:self-stretch",
				className,
			)}
			{...props}
		/>
	);
}

export { Separator };
