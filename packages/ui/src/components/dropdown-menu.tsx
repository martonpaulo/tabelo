"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
	menuCheckboxIndicatorStyles,
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
	singleSelectionIndicatorFillStyles,
	singleSelectionIndicatorShapeStyles,
} from "@tabelo/ui/components/menu-styles";
import { ShortcutKeys } from "@tabelo/ui/components/shortcut-keys";
import { cn } from "@tabelo/ui/lib/utils";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";

// Generic over the payload Base UI already carries from a trigger to its root,
// so a detached trigger can name what it opened the menu for. Defaulting to
// `unknown` keeps every existing payload-free call site inferring exactly as
// before. See https://base-ui.com/react/components/menu#detached-triggers
function DropdownMenu<Payload = unknown>({
	...props
}: MenuPrimitive.Root.Props<Payload>) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

// The link between one root and the many triggers that can open it. Consumers
// get it from here rather than from Base UI directly, so the primitive stays
// the single place this package's menu machinery is imported from.
type DropdownMenuHandle<Payload = unknown> = MenuPrimitive.Handle<Payload>;

function createDropdownMenuHandle<
	Payload = unknown,
>(): DropdownMenuHandle<Payload> {
	return MenuPrimitive.createHandle<Payload>();
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
	return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger<Payload = unknown>({
	...props
}: MenuPrimitive.Trigger.Props<Payload>) {
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
			{...props}
		>
			{children}
			<ChevronRightIcon className="cn-rtl-flip ml-auto" />
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
				"cn-menu-target cn-menu-translucent w-auto min-w-24 shadow-lg",
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
				<MenuPrimitive.CheckboxItemIndicator>
					<CheckIcon />
				</MenuPrimitive.CheckboxItemIndicator>
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

export type { DropdownMenuHandle };
export {
	createDropdownMenuHandle,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};
