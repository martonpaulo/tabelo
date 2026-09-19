import {
	controlStateTransitionStyles,
	popupTransitionStyles,
} from "@tabelo/ui/components/motion-styles";
import { floatingSurfaceStyles } from "@tabelo/ui/components/surface-styles";

// Dropdown and context menus are different interaction primitives with the
// same visual contract. Shared strings keep geometry and states in one place.
export const menuPopupStyles = `rounded-surface p-1 text-popover-foreground outline-none supports-backdrop-filter:[--hairline-fill:color-mix(in_oklab,var(--popover)_94%,transparent)] supports-backdrop-filter:backdrop-blur-md ${floatingSurfaceStyles} ${popupTransitionStyles}`;

// The inset every menu row keeps from the popup's edge. Anything static a
// menu shows beside its items reuses it, so its text lines up with theirs.
export const menuItemInsetStyles = "px-2 py-2";

export const menuLabelStyles =
	"px-2 py-1.5 text-muted-foreground text-xs leading-none data-inset:pl-6";

export const menuItemLayoutStyles = `relative flex min-h-control-md cursor-pointer select-none items-center gap-3 rounded-interactive ${menuItemInsetStyles} text-sm leading-snug outline-hidden data-disabled:cursor-not-allowed data-inset:pl-6 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 ${controlStateTransitionStyles}`;

// `pr-12` is clearance, not rhythm: it keeps a row's text off the trailing
// on/off indicator (`right-2` plus its `w-7` track), so it stays off the
// spacing scale on purpose (#354).
export const menuChoiceItemLayoutStyles = `relative flex min-h-control-md cursor-pointer select-none items-center gap-3 rounded-interactive py-2 pr-12 pl-2 text-sm leading-snug outline-hidden data-disabled:cursor-not-allowed data-inset:pl-6 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 ${controlStateTransitionStyles}`;

export const menuInteractiveItemStateStyles =
	"not-data-disabled:hover:bg-accent not-data-disabled:hover:text-accent-foreground not-data-disabled:hover:**:text-accent-foreground not-data-disabled:focus:bg-accent not-data-disabled:focus:text-accent-foreground not-data-disabled:focus:**:text-accent-foreground";

export const menuDestructiveItemStateStyles =
	"data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:focus:**:text-destructive data-[variant=destructive]:hover:bg-destructive/10 data-[variant=destructive]:hover:text-destructive data-[variant=destructive]:hover:**:text-destructive data-disabled:hover:bg-transparent dark:data-[variant=destructive]:focus:bg-destructive/20 dark:data-[variant=destructive]:hover:bg-destructive/20";

export const menuSingleSelectionItemStateStyles =
	"data-checked:bg-selection-fill data-checked:text-foreground data-checked:hover:bg-selection-fill data-checked:focus:bg-selection-fill";

// The option block: one choice drawn as a filled, rounded block with an icon,
// a label, a line of detail, and an optional trailing hint. The start surface,
// every choice dialog, and every checkbox option share it, so a choice looks
// the same wherever it is offered (2026-09-18 restyle). Resting on the muted
// fill, a pointer lifts it to the accent, and the chosen one, or the one
// action a surface recommends, is the solid primary with white text.
export const optionBlockStyles =
	"relative flex min-h-control-md w-full items-center gap-3 rounded-interactive bg-muted p-3 text-left text-sm leading-snug [&_[data-slot=selection-option-icon]>svg:not([class*='size-'])]:size-5";

export const optionBlockStateStyles =
	"cursor-pointer not-data-[disabled=true]:not-data-[selected=true]:not-data-[emphasis=primary]:hover:bg-accent not-data-[disabled=true]:not-data-[selected=true]:not-data-[emphasis=primary]:hover:text-accent-foreground not-data-[disabled=true]:not-data-[selected=true]:not-data-[emphasis=primary]:hover:**:text-accent-foreground data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:**:text-primary-foreground data-[emphasis=primary]:bg-primary data-[emphasis=primary]:text-primary-foreground data-[emphasis=primary]:**:text-primary-foreground data-[emphasis=primary]:hover:bg-primary/90 data-[disabled=true]:cursor-not-allowed";

export const menuShortcutStyles =
	"ml-auto inline-flex items-center gap-0.5 font-sans text-muted-foreground text-xs leading-none tracking-normal";

// A shortcut is one run of text in the interface face, "⌘C" on Apple keyboards and
// "Ctrl+C" elsewhere, the same spelling the start surface shows (2026-09-19).
export const menuShortcutKeyStyles =
	"font-sans text-xs leading-none tracking-normal";

// The two menu indicators wear the product's own checkbox and radio anatomy:
// the same 1rem box, the same control radius, the same unfilled outline, and
// the same primary fill once chosen. A menu is not the place to invent a third
// way of drawing a choice. See docs/design-system/3-components.md.
// A menu's on/off item wears the shared Switch's anatomy at menu size: an
// outlined track with the thumb at the start, the solid primary with the thumb
// at the end once on. Settings and menus then draw one kind of on/off choice.
export const menuCheckboxIndicatorStyles =
	"pointer-events-none absolute right-2 flex h-4 w-7 shrink-0 items-center rounded-full border border-control-outline group-data-checked/menu-choice:border-primary group-data-checked/menu-choice:bg-primary";

export const menuCheckboxThumbStyles =
	"block size-2.5 translate-x-0.5 rounded-full bg-control-outline transition-transform duration-100 ease-out group-data-checked/menu-choice:translate-x-3.5 group-data-checked/menu-choice:bg-primary-foreground";

export const singleSelectionIndicatorShapeStyles =
	"relative flex size-4 shrink-0 items-center justify-center rounded-full border border-control-outline";

export const singleSelectionIndicatorFillStyles =
	"absolute inset-0 rounded-full bg-primary";

export const menuSubTriggerLayoutStyles = `flex min-h-control-md cursor-pointer select-none items-center gap-3 rounded-interactive ${menuItemInsetStyles} text-sm leading-snug outline-hidden data-inset:pl-6 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 ${controlStateTransitionStyles}`;

export const menuSeparatorStyles = "-mx-1 my-2 h-hairline bg-border";

// Two to four short, mutually exclusive values laid side by side: the shared
// SegmentedControl in a dialog and the segmented radio group in a menu draw
// with these same two strings, so a choice like a column's expected type or
// alignment reads the same in both places (2026-09-19).
export const segmentedGroupStyles =
	"grid auto-cols-fr grid-flow-col gap-0.5 rounded-interactive bg-surface-app p-0.5";

export const segmentedItemStyles =
	"flex min-h-control-sm cursor-pointer select-none items-center justify-center gap-1 rounded-indicator px-2 py-1 text-center text-muted-foreground text-xs leading-tight not-data-checked:hover:bg-accent not-data-checked:hover:text-accent-foreground not-data-checked:data-highlighted:bg-accent not-data-checked:data-highlighted:text-accent-foreground data-checked:bg-primary data-checked:text-primary-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0";

// A command drawn as one segment of a row of related commands, such as the pane
// zoom's out, reset, and in: the segment geometry, the menu's own highlight.
export const menuInlineItemStyles =
	"min-h-control-sm justify-center gap-1.5 rounded-indicator px-2 py-1 text-xs";

// The partly-on mark: a dot centred under the icon, in the accent. Forced
// colours are the app stylesheet's, beside the Format marks' other rules.
const menuToggleSegmentMixedStyles =
	"aria-[checked=mixed]:after:absolute aria-[checked=mixed]:after:bottom-0.5 aria-[checked=mixed]:after:left-1/2 aria-[checked=mixed]:after:size-1 aria-[checked=mixed]:after:-translate-x-1/2 aria-[checked=mixed]:after:rounded-full aria-[checked=mixed]:after:bg-primary";

// A segment that turns on and off by itself rather than choosing among its
// neighbours, such as a Format mark in the Visual Table's cell menu (#306).
// On, it wears a segmented choice's checked fill. Partly on, across a
// selection that disagrees, it stays unpressed and carries a small accent dot
// under its icon (owner, 2026-09-19): a fill would read as pressed, and the
// command it runs is the unpressed one, adding the mark everywhere. The state
// is read from the item's own `aria-checked`, so what is drawn and what is
// announced agree.
export const menuToggleSegmentStyles = `relative ${menuInlineItemStyles} aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:**:text-primary-foreground ${menuToggleSegmentMixedStyles}`;
