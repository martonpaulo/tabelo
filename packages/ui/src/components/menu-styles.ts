import {
	controlStateTransitionStyles,
	popupTransitionStyles,
} from "@tabelo/ui/components/motion-styles";
import { floatingSurfaceStyles } from "@tabelo/ui/components/surface-styles";

// Dropdown and context menus are different interaction primitives with the
// same visual contract. Shared strings keep geometry and states in one place.
export const menuPopupStyles = `rounded-surface p-1 text-popover-foreground outline-none supports-backdrop-filter:[--hairline-fill:color-mix(in_oklab,var(--popover)_94%,transparent)] supports-backdrop-filter:backdrop-blur-md ${floatingSurfaceStyles} ${popupTransitionStyles}`;

export const menuLabelStyles =
	"px-2 py-1.5 text-muted-foreground text-xs leading-none data-inset:pl-7";

export const menuItemLayoutStyles = `relative flex min-h-control-md cursor-pointer select-none items-center gap-3 rounded-interactive px-2 py-2 text-sm leading-snug outline-hidden data-disabled:cursor-not-allowed data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 ${controlStateTransitionStyles}`;

export const menuChoiceItemLayoutStyles = `relative flex min-h-control-md cursor-pointer select-none items-center gap-3 rounded-interactive py-2 pr-10 pl-2 text-sm leading-snug outline-hidden data-disabled:cursor-not-allowed data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 ${controlStateTransitionStyles}`;

export const menuInteractiveItemStateStyles =
	"not-data-disabled:hover:bg-accent not-data-disabled:hover:text-accent-foreground not-data-disabled:hover:**:text-accent-foreground not-data-disabled:focus:bg-accent not-data-disabled:focus:text-accent-foreground not-data-disabled:focus:**:text-accent-foreground";

export const menuDestructiveItemStateStyles =
	"data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:focus:**:text-destructive data-[variant=destructive]:hover:bg-destructive/10 data-[variant=destructive]:hover:text-destructive data-[variant=destructive]:hover:**:text-destructive data-disabled:hover:bg-transparent dark:data-[variant=destructive]:focus:bg-destructive/20 dark:data-[variant=destructive]:hover:bg-destructive/20";

export const menuSingleSelectionItemStateStyles =
	"data-checked:bg-selection-fill data-checked:text-foreground data-checked:hover:bg-selection-fill data-checked:focus:bg-selection-fill";

export const dialogSingleSelectionItemStateStyles =
	"not-data-[disabled=true]:hover:bg-accent not-data-[disabled=true]:hover:text-accent-foreground not-data-[disabled=true]:hover:**:text-accent-foreground not-data-[disabled=true]:focus-within:text-accent-foreground not-data-[disabled=true]:focus-within:**:text-accent-foreground data-[selected=true]:bg-selection-fill data-[selected=true]:text-foreground data-[selected=true]:hover:bg-selection-fill";

export const menuShortcutStyles =
	"ml-auto inline-flex items-center gap-0.5 font-sans text-muted-foreground text-xs leading-none tracking-normal";

export const menuShortcutKeyStyles =
	"min-w-5 rounded-interactive bg-muted px-1 py-0.5 text-center font-sans text-xs leading-none tracking-normal";

// The two menu indicators wear the product's own checkbox and radio anatomy:
// the same 1rem box, the same control radius, the same unfilled outline, and
// the same primary fill once chosen. A menu is not the place to invent a third
// way of drawing a choice. See docs/design-system.md §3.
export const menuCheckboxIndicatorStyles =
	"pointer-events-none absolute right-2 flex size-4 shrink-0 items-center justify-center rounded-interactive border border-control-outline text-primary-foreground group-data-checked/menu-choice:border-primary group-data-checked/menu-choice:bg-primary";

export const singleSelectionIndicatorShapeStyles =
	"relative flex size-4 shrink-0 items-center justify-center rounded-full border border-control-outline";

export const singleSelectionIndicatorFillStyles =
	"absolute inset-0 rounded-full bg-primary";

export const menuSubTriggerLayoutStyles = `flex min-h-control-md cursor-pointer select-none items-center gap-3 rounded-interactive px-2 py-2 text-sm leading-snug outline-hidden data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 ${controlStateTransitionStyles}`;

export const menuSeparatorStyles = "-mx-1 my-1 h-[0.0625rem] bg-border";
