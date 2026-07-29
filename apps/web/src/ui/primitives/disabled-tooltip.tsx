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
			<TooltipContent side="right">{reason}</TooltipContent>
		</Tooltip>
	);
}
