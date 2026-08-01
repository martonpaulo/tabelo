// Motion is grouped by interaction purpose rather than by feature. Keep these
// lists explicit: `transition-all` can animate layout or another property a
// component adds later, which makes a fast interface feel unpredictable.

export const controlStateTransitionStyles =
	"transition-[background-color,border-color,color,box-shadow,opacity] duration-100 ease-out";

export const pressableControlTransitionStyles =
	"transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-100 ease-out";

export const disclosureTransitionStyles =
	"transition-[color,opacity] duration-100 ease-out";

// Base UI keeps transient layers mounted through their ending transition. A
// cancellable transition lets an immediately reversed command continue from
// its current visual state instead of restarting a keyframe animation.
export const popupTransitionStyles =
	"origin-(--transform-origin) transition-[opacity,transform] duration-100 ease-out data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100";

export const overlayTransitionStyles =
	"transition-opacity duration-100 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0";
