import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tabelo/ui/components/tooltip";
import { cloneElement, type ReactElement, useId } from "react";

type DescribableProps = {
	readonly "aria-describedby"?: string;
};

export function DisabledTooltip({
	reason,
	children,
}: {
	readonly reason?: string;
	readonly children: ReactElement<DescribableProps>;
}) {
	const descriptionId = useId();
	if (!reason) return children;
	const describedBy = [children.props["aria-describedby"], descriptionId]
		.filter(Boolean)
		.join(" ");

	return (
		<Tooltip>
			<TooltipTrigger render={<span className="block" />}>
				{cloneElement(children, { "aria-describedby": describedBy })}
				<span id={descriptionId} className="sr-only">
					{reason}
				</span>
			</TooltipTrigger>
			{/* No side of its own: a disabled reason is an ordinary tooltip and
			    uses the shared placement, which flips itself when the preferred
			    side does not fit. */}
			<TooltipContent>{reason}</TooltipContent>
		</Tooltip>
	);
}
