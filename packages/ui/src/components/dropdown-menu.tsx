import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";

("use client");

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
	menuCheckboxIndicatorStyles,
	menuCheckboxThumbStyles,
	menuChoiceItemLayoutStyles,
	menuDestructiveItemStateStyles,
	menuInteractiveItemStateStyles,
	menuItemLayoutStyles,
	menuLabelStyles,
	menuPopupStyles,
	menuSeparatorStyles,
	menuShortcutStyles,
	menuSingleSelectionItemStateStyles,
	menuSubTriggerLayoutStyles,
	segmentedItemStyles,
	singleSelectionIndicatorFillStyles,
	singleSelectionIndicatorShapeStyles,
} from "@tabelo/ui/components/menu-styles";
import { ShortcutKeys } from "@tabelo/ui/components/shortcut-keys";
import { cn } from "@tabelo/ui/lib/utils";
import { IconChevronRight } from "@tabler/icons-react";
import type * as React from "react";

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
	return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
	return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
	align = "start",
	alignOffset = 0,
	side = "bottom",
	sideOffset = 4,
	className,
	...props
}: MenuPrimitive.Popup.Props &
	Pick<
		MenuPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className="isolate z-50 outline-none"
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
			>
				<MenuPrimitive.Popup
					data-slot="dropdown-menu-content"
					className={cn(
						"cn-menu-target cn-menu-translucent z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 overflow-y-auto overflow-x-hidden data-ending-style:overflow-hidden",
						menuPopupStyles,
						className,
					)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: MenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
}) {
	return (
		<MenuPrimitive.GroupLabel
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn(menuLabelStyles, className)}
			{...props}
		/>
	);
}

function DropdownMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: MenuPrimitive.Item.Props & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<MenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				menuItemLayoutStyles,
				menuInteractiveItemStateStyles,
				menuDestructiveItemStateStyles,
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: MenuPrimitive.SubmenuTrigger.Props & {
	inset?: boolean;
}) {
	return (
		<MenuPrimitive.SubmenuTrigger
			data-slot="dropdown-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				menuSubTriggerLayoutStyles,
				"focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-open:bg-accent data-popup-open:bg-accent data-open:text-accent-foreground data-popup-open:text-accent-foreground",
				className,
			)}
			// Base UI 1.8 drops `aria-expanded` from an open submenu trigger in a
			// production build while keeping `data-popup-open`, so a screen reader
			// stops hearing that the submenu is open. The state it already tracks
			// is written back onto the element.
			render={(renderProps, state) => (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role, tabIndex, and handlers arrive in renderProps from Base UI.
				<div {...renderProps} aria-expanded={state.open} />
			)}
			{...props}
		>
			{children}
			<IconChevronRight className="cn-rtl-flip ml-auto" />
		</MenuPrimitive.SubmenuTrigger>
	);
}

function DropdownMenuSubContent({
	align = "start",
	alignOffset = -3,
	side = "right",
	sideOffset = 0,
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
	return (
		<DropdownMenuContent
			data-slot="dropdown-menu-sub-content"
			className={cn(
				"cn-menu-target cn-menu-translucent w-auto min-w-24",
				className,
			)}
			align={align}
			alignOffset={alignOffset}
			side={side}
			sideOffset={sideOffset}
			{...props}
		/>
	);
}

function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: MenuPrimitive.CheckboxItem.Props & {
	inset?: boolean;
}) {
	return (
		<MenuPrimitive.CheckboxItem
			data-slot="dropdown-menu-checkbox-item"
			data-inset={inset}
			className={cn(
				"group/menu-choice",
				menuChoiceItemLayoutStyles,
				menuInteractiveItemStateStyles,
				className,
			)}
			checked={checked}
			{...props}
		>
			<span
				className={menuCheckboxIndicatorStyles}
				data-slot="dropdown-menu-checkbox-item-indicator"
			>
				<span className={menuCheckboxThumbStyles} />
			</span>
			{children}
		</MenuPrimitive.CheckboxItem>
	);
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
	return (
		<MenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	);
}

function DropdownMenuRadioItem({
	className,
	children,
	inset,
	hideIndicator = false,
	...props
}: MenuPrimitive.RadioItem.Props & {
	inset?: boolean;
	hideIndicator?: boolean;
}) {
	return (
		<MenuPrimitive.RadioItem
			data-slot="dropdown-menu-radio-item"
			data-inset={inset}
			className={cn(
				hideIndicator ? menuItemLayoutStyles : menuChoiceItemLayoutStyles,
				menuInteractiveItemStateStyles,
				menuSingleSelectionItemStateStyles,
				className,
			)}
			{...props}
		>
			{hideIndicator ? null : (
				<span
					className={cn(
						singleSelectionIndicatorShapeStyles,
						"pointer-events-none absolute right-2",
					)}
					data-slot="dropdown-menu-radio-item-indicator"
				>
					<MenuPrimitive.RadioItemIndicator
						className={singleSelectionIndicatorFillStyles}
					/>
				</span>
			)}
			{children}
		</MenuPrimitive.RadioItem>
	);
}

// One value of a segmented radio group inside a menu: the same drawing as the
// shared SegmentedControl, with the menu's radio semantics and keyboard model.
// Group it in a DropdownMenuRadioGroup carrying `segmentedGroupStyles`.
function DropdownMenuSegmentedItem({
	className,
	...props
}: MenuPrimitive.RadioItem.Props) {
	return (
		<MenuPrimitive.RadioItem
			data-slot="dropdown-menu-segmented-item"
			// A choice made, like any menu command: Base UI keeps a radio
			// item's menu open unless told otherwise.
			closeOnClick
			className={cn(
				segmentedItemStyles,
				// In a menu the highlight is the keyboard cue, as on every row.
				"outline-hidden",
				controlStateTransitionStyles,
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({
	className,
	...props
}: MenuPrimitive.Separator.Props) {
	return (
		<MenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn(menuSeparatorStyles, className)}
			{...props}
		/>
	);
}

function DropdownMenuShortcut({
	className,
	children,
	...props
}: Omit<React.ComponentProps<"span">, "children"> & {
	readonly children: string;
}) {
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn(menuShortcutStyles, className)}
			{...props}
		>
			<ShortcutKeys shortcut={children} />
		</span>
	);
}

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
