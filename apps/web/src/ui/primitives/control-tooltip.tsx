import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tabelo/ui/components/tooltip";
import {
	cloneElement,
	createContext,
	type ReactElement,
	useContext,
	useId,
} from "react";

type TooltipTargetProps = {
	readonly "aria-describedby"?: string;
	readonly "aria-label"?: string;
};

// Set inside a ControlTooltip, so a second one on the same control is refused
// instead of mounting two floating layers that race over one trigger.
const InsideControlTooltip = createContext(false);

// The one tooltip a control carries (#277). It has two possible contents, and
// shows at most one of them:
//
// - `reason`: why the control is disabled. The more specific and more urgent
//   fact, so it wins whenever it is set. It is associated as the control's
//   description, because a disabled control must say why to every reader.
// - `name`: what an icon-only control does. The same string becomes the
//   control's `aria-label`, so the accessible name and the words shown cannot
//   drift apart, and the tooltip itself is hidden from assistive technology,
//   which already has the name: nothing is announced twice.
//
// A labelled control passes neither and gets no tooltip at all.
export function ControlTooltip({
	name,
	reason,
	children,
}: {
	readonly name?: string;
	readonly reason?: string;
	readonly children: ReactElement<TooltipTargetProps>;
}) {
	const nested = useContext(InsideControlTooltip);
	const descriptionId = useId();
	if (nested) {
		throw new Error(
			"A control carries one ControlTooltip. Pass its name and its reason to the same one.",
		);
	}
	const named =
		name === undefined
			? children
			: cloneElement(children, { "aria-label": name });

	if (reason) {
		const describedBy = [named.props["aria-describedby"], descriptionId]
			.filter(Boolean)
			.join(" ");
		return (
			<InsideControlTooltip.Provider value={true}>
				<Tooltip>
					{/* A disabled control receives no pointer events, so the wrapper
					    is what the pointer reaches. */}
					<TooltipTrigger render={<span className="block" />}>
						{cloneElement(named, { "aria-describedby": describedBy })}
						<span id={descriptionId} className="sr-only">
							{reason}
						</span>
					</TooltipTrigger>
					{/* No side of its own: a tooltip uses the shared placement, which
					    flips itself when the preferred side does not fit. */}
					<TooltipContent>{reason}</TooltipContent>
				</Tooltip>
			</InsideControlTooltip.Provider>
		);
	}

	if (name === undefined) return children;

	return (
		<InsideControlTooltip.Provider value={true}>
			<Tooltip>
				{/* An enabled control takes the trigger's behaviour directly, with no
				    wrapper between it and its own handlers, so a menu trigger still
				    opens on the first click. */}
				<TooltipTrigger render={named} />
				<TooltipContent aria-hidden>{name}</TooltipContent>
			</Tooltip>
		</InsideControlTooltip.Provider>
	);
}
