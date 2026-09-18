import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
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
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { ShortcutKeys } from "@tabelo/ui/components/shortcut-keys";
import { cn } from "@tabelo/ui/lib/utils";
import { IconChevronRight } from "@tabler/icons-react";
import type * as React from "react";

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
	return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuPortal({ ...props }: ContextMenuPrimitive.Portal.Props) {
	return (
		<ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
	);
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

function ContextMenuContent({
	className,
	align = "start",
	alignOffset = 4,
	side = "right",
	sideOffset = 0,
	...props
}: ContextMenuPrimitive.Popup.Props &
	Pick<
		ContextMenuPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Positioner
				className="isolate z-50 outline-none"
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
			>
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-content"
					className={cn(
						"z-50 max-h-(--available-height) min-w-36 overflow-y-auto overflow-x-hidden data-ending-style:overflow-hidden",
						menuPopupStyles,
						className,
					)}
					{...props}
				/>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuGroup({ ...props }: ContextMenuPrimitive.Group.Props) {
	return (
		<ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
	);
}

function ContextMenuLabel({
	className,
	inset,
	...props
}: ContextMenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.GroupLabel
			data-slot="context-menu-label"
			data-inset={inset}
			className={cn(menuLabelStyles, className)}
			{...props}
		/>
	);
}

function ContextMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: ContextMenuPrimitive.Item.Props & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<ContextMenuPrimitive.Item
			data-slot="context-menu-item"
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

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
	return (
		<ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
	);
}

function ContextMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: ContextMenuPrimitive.SubmenuTrigger.Props & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.SubmenuTrigger
			data-slot="context-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				menuSubTriggerLayoutStyles,
				"focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground",
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
			<IconChevronRight className="ml-auto" />
		</ContextMenuPrimitive.SubmenuTrigger>
	);
}

function ContextMenuSubContent({
	...props
}: React.ComponentProps<typeof ContextMenuContent>) {
	return (
		<ContextMenuContent
			data-slot="context-menu-sub-content"
			className="shadow-lg"
			side="right"
			{...props}
		/>
	);
}

function ContextMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: ContextMenuPrimitive.CheckboxItem.Props & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.CheckboxItem
			data-slot="context-menu-checkbox-item"
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
				data-slot="context-menu-checkbox-item-indicator"
			>
				<span className={menuCheckboxThumbStyles} />
			</span>
			{children}
		</ContextMenuPrimitive.CheckboxItem>
	);
}

function ContextMenuRadioGroup({
	...props
}: ContextMenuPrimitive.RadioGroup.Props) {
	return (
		<ContextMenuPrimitive.RadioGroup
			data-slot="context-menu-radio-group"
			{...props}
		/>
	);
}

function ContextMenuRadioItem({
	className,
	children,
	inset,
	hideIndicator = false,
	...props
}: ContextMenuPrimitive.RadioItem.Props & {
	inset?: boolean;
	hideIndicator?: boolean;
}) {
	return (
		<ContextMenuPrimitive.RadioItem
			data-slot="context-menu-radio-item"
			data-inset={inset}
			className={cn(
				menuChoiceItemLayoutStyles,
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
					data-slot="context-menu-radio-item-indicator"
				>
					<ContextMenuPrimitive.RadioItemIndicator
						className={singleSelectionIndicatorFillStyles}
					/>
				</span>
			)}
			{children}
		</ContextMenuPrimitive.RadioItem>
	);
}

// One value of a segmented radio group inside a menu: the same drawing as the
// shared SegmentedControl, with the menu's radio semantics and keyboard model.
// Group it in a ContextMenuRadioGroup carrying `segmentedGroupStyles`.
function ContextMenuSegmentedItem({
	className,
	...props
}: ContextMenuPrimitive.RadioItem.Props) {
	return (
		<ContextMenuPrimitive.RadioItem
			data-slot="context-menu-segmented-item"
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

function ContextMenuSeparator({
	className,
	...props
}: ContextMenuPrimitive.Separator.Props) {
	return (
		<ContextMenuPrimitive.Separator
			data-slot="context-menu-separator"
			className={cn(menuSeparatorStyles, className)}
			{...props}
		/>
	);
}

function ContextMenuShortcut({
	className,
	children,
	...props
}: Omit<React.ComponentProps<"span">, "children"> & {
	readonly children: string;
}) {
	return (
		<span
			data-slot="context-menu-shortcut"
			className={cn(menuShortcutStyles, className)}
			{...props}
		>
			<ShortcutKeys shortcut={children} />
		</span>
	);
}

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
