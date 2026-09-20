("use client");

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { createMenuComponents } from "@tabelo/ui/components/menu-parts";
import { cn } from "@tabelo/ui/lib/utils";

// The rows, groups, submenu, and popup are the shared menu implementation
// (menu-parts.tsx). What belongs to this menu is its root, trigger, and
// positioner, the three parts Base UI does not share with the dropdown menu
// because a context menu opens at the pointer rather than against a button.
const parts = createMenuComponents({
	slot: "context-menu",
	positioner: ContextMenuPrimitive.Positioner,
	content: {
		align: "start",
		alignOffset: 4,
		side: "right",
		sideOffset: 0,
		className:
			"z-50 max-h-(--available-height) min-w-36 overflow-y-auto overflow-x-hidden data-ending-style:overflow-hidden",
	},
	subContent: { side: "right" },
	subTriggerClassName:
		"focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-popup-open:bg-accent data-open:text-accent-foreground data-popup-open:text-accent-foreground",
});

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
	return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({
	className,
	...props
}: ContextMenuPrimitive.Trigger.Props) {
	return (
		<ContextMenuPrimitive.Trigger
			data-slot="context-menu-trigger"
			className={cn("select-none", className)}
			{...props}
		/>
	);
}

const {
	CheckboxItem: ContextMenuCheckboxItem,
	Content: ContextMenuContent,
	Group: ContextMenuGroup,
	Item: ContextMenuItem,
	Label: ContextMenuLabel,
	Portal: ContextMenuPortal,
	RadioGroup: ContextMenuRadioGroup,
	RadioItem: ContextMenuRadioItem,
	SegmentedItem: ContextMenuSegmentedItem,
	Separator: ContextMenuSeparator,
	Shortcut: ContextMenuShortcut,
	Sub: ContextMenuSub,
	SubContent: ContextMenuSubContent,
	SubTrigger: ContextMenuSubTrigger,
} = parts;

export {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuPortal,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSegmentedItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
};
