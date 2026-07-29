// Dropdown and context menus are different interaction primitives with the
// same visual contract. Shared strings keep geometry and states in one place.
export const menuPopupStyles =
	"rounded-surface bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 supports-backdrop-filter:bg-popover/88 supports-backdrop-filter:backdrop-blur-md";

export const menuLabelStyles =
	"px-2 py-1.5 text-muted-foreground text-xs leading-none data-inset:pl-7";

export const menuItemLayoutStyles =
	"relative flex min-h-control-md cursor-pointer select-none items-center gap-2 rounded-interactive px-2 py-1.5 text-sm leading-snug outline-hidden data-disabled:cursor-not-allowed data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0";

export const menuChoiceItemLayoutStyles =
	"relative flex min-h-control-md cursor-pointer select-none items-center gap-2 rounded-interactive py-1.5 pr-8 pl-2 text-sm leading-snug outline-hidden data-disabled:cursor-not-allowed data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0";

export const menuSubTriggerLayoutStyles =
	"flex min-h-control-md cursor-pointer select-none items-center gap-2 rounded-interactive px-2 py-1.5 text-sm leading-snug outline-hidden data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0";

export const menuSeparatorStyles = "-mx-1 my-1 h-[0.0625rem] bg-border";
