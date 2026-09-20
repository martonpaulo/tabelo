("use client");

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { createMenuComponents } from "@tabelo/ui/components/menu-parts";

// The rows, groups, submenu, and popup are the shared menu implementation
// (menu-parts.tsx). What belongs to this menu is its root and trigger, which
// Base UI does not share with the context menu, and the placement and slot
// name a menu opened from a button wants.
const parts = createMenuComponents({
	slot: "dropdown-menu",
	positioner: MenuPrimitive.Positioner,
	content: {
		align: "start",
		alignOffset: 0,
		side: "bottom",
		sideOffset: 4,
		className:
			"cn-menu-target cn-menu-translucent z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 overflow-y-auto overflow-x-hidden data-ending-style:overflow-hidden",
	},
	subContent: {
		align: "start",
		alignOffset: -3,
		side: "right",
		sideOffset: 0,
		className: "cn-menu-target cn-menu-translucent w-auto min-w-24",
	},
	subTriggerClassName:
		"focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-open:bg-accent data-popup-open:bg-accent data-open:text-accent-foreground data-popup-open:text-accent-foreground",
});

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
	return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

const {
	CheckboxItem: DropdownMenuCheckboxItem,
	Content: DropdownMenuContent,
	Group: DropdownMenuGroup,
	Item: DropdownMenuItem,
	Label: DropdownMenuLabel,
	Portal: DropdownMenuPortal,
	RadioGroup: DropdownMenuRadioGroup,
	RadioItem: DropdownMenuRadioItem,
	SegmentedItem: DropdownMenuSegmentedItem,
	Separator: DropdownMenuSeparator,
	Shortcut: DropdownMenuShortcut,
	Sub: DropdownMenuSub,
	SubContent: DropdownMenuSubContent,
	SubTrigger: DropdownMenuSubTrigger,
} = parts;

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSegmentedItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};
