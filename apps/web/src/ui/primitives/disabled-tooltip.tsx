import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tabelo/ui/components/tooltip";
import type { ReactElement } from "react";

export function DisabledTooltip({
	reason,
	children,
}: {
	readonly reason?: string;
	readonly children: ReactElement;
}) {
	if (!reason) return children;

	return (
		<Tooltip>
			<TooltipTrigger render={<span className="block" />}>
				{children}
			</TooltipTrigger>
			{/* No side of its own: a disabled reason is an ordinary tooltip and
			    uses the shared placement, which flips itself when the preferred
			    side does not fit. */}
			<TooltipContent>{reason}</TooltipContent>
		</Tooltip>
	);
}
