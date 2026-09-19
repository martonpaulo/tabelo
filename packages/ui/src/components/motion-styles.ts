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
//
// The shared motion tokens set the pace: a layer arrives over `--motion-enter`
// and leaves over the quicker `--motion-exit`, because a menu on its way out
// has already been dismissed and the user is looking at what it uncovers. The
// scale grows from Base UI's own `--transform-origin`, so a layer expands out
// of the side it opened from without a keyframe or a per-side translate.
export const popupTransitionStyles =
	"origin-(--transform-origin) transition-[opacity,transform] duration-(--motion-enter) ease-(--motion-ease) data-starting-style:scale-[0.96] data-starting-style:opacity-0 data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-ending-style:duration-(--motion-exit) motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100";

export const overlayTransitionStyles =
	"transition-opacity duration-(--motion-enter) ease-(--motion-ease) data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-(--motion-exit)";
