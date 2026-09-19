import { ShortcutKeys } from "@tabelo/ui/components/shortcut-keys";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tabelo/ui/components/tooltip";
import {
	type ComponentProps,
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

// The keys a user moves focus with: Tab through the page, and the arrow, Home,
// End, and page keys inside a menu, a list, or a radio group.
const NAVIGATION_KEYS = new Set([
	"Tab",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

// Whether focus is arriving because the user is moving it from the keyboard.
// It is true only between a navigation keydown and the next key release or
// press, which is exactly when the focus that key causes lands. Focus handed
// back by a closing menu or dialog, after Escape, Enter, or a click, or moved
// by the product itself, lands outside that window.
let navigating = false;
if (typeof document !== "undefined") {
	document.addEventListener(
		"keydown",
		(event) => {
			navigating = NAVIGATION_KEYS.has(event.key);
		},
		true,
	);
	for (const type of ["keyup", "pointerdown"] as const) {
		document.addEventListener(
			type,
			() => {
				navigating = false;
			},
			true,
		);
	}
}

// A tooltip opens on keyboard focus so a keyboard user reads what a pointer
// user reads on hover (section 9). Focus the user did not move there, such as
// the focus a menu or dialog returns to its trigger on close, is not a request
// to read it, and the tooltip it used to raise covered the next thing the user
// looked at (owner, 2026-09-19).
const onlyUserFocus: NonNullable<
	ComponentProps<typeof Tooltip>["onOpenChange"]
> = (open, details) => {
	if (open && details.reason === "trigger-focus" && !navigating) {
		details.cancel();
	}
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
	shortcut,
	children,
}: {
	readonly name?: string;
	readonly reason?: string;
	// The chord an icon-only control answers to, drawn beside its name in the
	// tooltip: an icon has no room for the legend a menu row prints (#306).
	// The control states it for assistive technology through its own
	// `aria-keyshortcuts`.
	readonly shortcut?: string;
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
				<Tooltip onOpenChange={onlyUserFocus}>
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
			<Tooltip onOpenChange={onlyUserFocus}>
				{/* An enabled control takes the trigger's behaviour directly, with no
				    wrapper between it and its own handlers, so a menu trigger still
				    opens on the first click. */}
				<TooltipTrigger render={named} />
				<TooltipContent aria-hidden>
					{shortcut ? (
						<span className="inline-flex items-center gap-2">
							{name}
							<ShortcutKeys shortcut={shortcut} />
						</span>
					) : (
						name
					)}
				</TooltipContent>
			</Tooltip>
		</InsideControlTooltip.Provider>
	);
}
