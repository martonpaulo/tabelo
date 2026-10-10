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
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { ShortcutKeys } from "@tabelo/ui/components/shortcut-keys";
import { cn } from "@tabelo/ui/lib/utils";
import { IconChevronRight } from "@tabler/icons-react";
import type * as React from "react";
import { createContext, useContext, useRef } from "react";

// One implementation for both menus. Base UI builds its context menu out of
// the menu's own parts: everything but the root, the trigger, and the
// positioner is literally the same component, re-exported under the context
// menu's namespace (@base-ui/react/context-menu/index.parts.d.ts), and the two
// wrapper modules here were the same file too until they drifted apart.
//
// What genuinely differs is where the popup is placed, since a context menu
// opens at the pointer, and the `data-slot` name each menu writes, which the
// app's stylesheet and its tests read. Both arrive as arguments.

// Where a popup sits relative to its anchor. The four positioner props each
// menu exposes on its content, no more, so a caller still places one popup
// without reaching the positioner itself.
export interface MenuPlacement {
	readonly align?: MenuPrimitive.Positioner.Props["align"];
	readonly alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
	readonly side?: MenuPrimitive.Positioner.Props["side"];
	readonly sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
}

// The trigger of the submenu around it, written by MenuSubTrigger and read by
// MenuSubContent when it closes.
const SubmenuTrigger = createContext<{ current: HTMLElement | null } | null>(
	null,
);

// Where a submenu hands focus as it closes (#480). Closed on its own, with
// ArrowLeft or Escape, its parent menu is still open, and focus goes back to
// the submenu's trigger, Base UI's default. Closed together with its parent,
// as a command chosen in it closes the whole menu, it leaves focus to the
// root menu's own `finalFocus`. The default would race that one, and once the
// root popup has unmounted the trigger is gone, so Base UI falls back to the
// element focused before the menu opened and takes focus back from wherever
// the root had put it. `data-open` is the popup's documented open state.
function submenuFinalFocus(trigger: HTMLElement | null): boolean {
	return trigger?.closest("[role='menu']")?.hasAttribute("data-open") ?? false;
}

// Where a closing menu may send focus once its exit transition ends (#501).
// Base UI returns focus only while focus is still in the menu or on the page
// body, so a user who moved on while the menu was leaving keeps their place
// (https://github.com/floating-ui/floating-ui/issues/2607). A function
// `finalFocus` counts as an explicit destination and skips that check, which
// took focus back from a notice's Dismiss button and sent the next Enter into
// a grid cell. This puts the check back in front of every such function.
type FinalFocus = MenuPrimitive.Popup.Props["finalFocus"];

function keepingFocusThatMovedOn(finalFocus: FinalFocus): FinalFocus {
	if (typeof finalFocus !== "function") return finalFocus;
	return (closeType) => {
		const active = document.activeElement;
		const movedOn =
			active !== null &&
			active !== document.body &&
			active.closest("[role='menu']") === null;
		return movedOn ? false : finalFocus(closeType);
	};
}

export interface MenuComponentOptions {
	// The prefix every `data-slot` in this menu carries, such as
	// "dropdown-menu": the attribute the stylesheet and the browser suite read.
	readonly slot: string;
	// This menu's own positioner, the one popup part the two do not share.
	readonly positioner: React.ElementType;
	// The popup surface: where it sits by default, and the classes it carries
	// beyond the shared ones, such as its width.
	readonly content: MenuPlacement & { readonly className: string };
	// A submenu's popup, as an override of the menu's own content.
	readonly subContent: MenuPlacement & { readonly className?: string };
	// The submenu trigger's focus and open classes. Parameterised rather than
	// shared because the two menus still disagree about them: the dropdown
	// colours the trigger's descendants on focus and the context menu does not,
	// a difference nothing here can explain, so unifying the two modules leaves
	// it visible rather than silently picking a side.
	readonly subTriggerClassName: string;
}

export function createMenuComponents(options: MenuComponentOptions) {
	const { slot } = options;

	function MenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
		return <MenuPrimitive.Portal data-slot={`${slot}-portal`} {...props} />;
	}

	function MenuContent({
		align = options.content.align,
		alignOffset = options.content.alignOffset,
		side = options.content.side,
		sideOffset = options.content.sideOffset,
		className,
		finalFocus,
		...props
	}: MenuPrimitive.Popup.Props & MenuPlacement) {
		const Positioner = options.positioner;
		return (
			<MenuPrimitive.Portal>
				<Positioner
					className="isolate z-50 outline-none"
					align={align}
					alignOffset={alignOffset}
					side={side}
					sideOffset={sideOffset}
				>
					<MenuPrimitive.Popup
						data-slot={`${slot}-content`}
						className={cn(
							options.content.className,
							menuPopupStyles,
							className,
						)}
						finalFocus={keepingFocusThatMovedOn(finalFocus)}
						{...props}
					/>
				</Positioner>
			</MenuPrimitive.Portal>
		);
	}

	function MenuGroup({ ...props }: MenuPrimitive.Group.Props) {
		return <MenuPrimitive.Group data-slot={`${slot}-group`} {...props} />;
	}

	function MenuLabel({
		className,
		inset,
		...props
	}: MenuPrimitive.GroupLabel.Props & {
		inset?: boolean;
	}) {
		return (
			<MenuPrimitive.GroupLabel
				data-slot={`${slot}-label`}
				data-inset={inset}
				className={cn(menuLabelStyles, className)}
				{...props}
			/>
		);
	}

	function MenuItem({
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
				data-slot={`${slot}-item`}
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

	function MenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
		const trigger = useRef<HTMLElement | null>(null);
		return (
			<SubmenuTrigger.Provider value={trigger}>
				<MenuPrimitive.SubmenuRoot data-slot={`${slot}-sub`} {...props} />
			</SubmenuTrigger.Provider>
		);
	}

	function MenuSubTrigger({
		className,
		inset,
		children,
		hideIndicator,
		...props
	}: MenuPrimitive.SubmenuTrigger.Props & {
		inset?: boolean;
		// A trigger that is one icon on a row rather than a labelled command:
		// the chevron would be a second glyph on a control that already reads
		// as "more", and there is no label for it to sit after.
		hideIndicator?: boolean;
	}) {
		const trigger = useContext(SubmenuTrigger);
		return (
			<MenuPrimitive.SubmenuTrigger
				ref={trigger}
				data-slot={`${slot}-sub-trigger`}
				data-inset={inset}
				className={cn(
					menuSubTriggerLayoutStyles,
					options.subTriggerClassName,
					className,
				)}
				// Base UI 1.8 drops `aria-expanded` from an open submenu trigger in a
				// production build while keeping `data-popup-open`, so a screen reader
				// stops hearing that the submenu is open. The state it already tracks
				// is written back onto the element.
				render={(
					renderProps: React.ComponentProps<"div">,
					state: { open: boolean },
				) => (
					// biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role, tabIndex, and handlers arrive in renderProps from Base UI.
					<div {...renderProps} aria-expanded={state.open} />
				)}
				{...props}
			>
				{children}
				{hideIndicator ? null : (
					<IconChevronRight className="cn-rtl-flip ml-auto" />
				)}
			</MenuPrimitive.SubmenuTrigger>
		);
	}

	function MenuSubContent({
		className,
		...props
	}: React.ComponentProps<typeof MenuContent>) {
		const trigger = useContext(SubmenuTrigger);
		return (
			<MenuContent
				finalFocus={() => submenuFinalFocus(trigger?.current ?? null)}
				data-slot={`${slot}-sub-content`}
				className={cn(options.subContent.className, className)}
				align={options.subContent.align}
				alignOffset={options.subContent.alignOffset}
				side={options.subContent.side}
				sideOffset={options.subContent.sideOffset}
				{...props}
			/>
		);
	}

	function MenuCheckboxItem({
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
				data-slot={`${slot}-checkbox-item`}
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
					data-slot={`${slot}-checkbox-item-indicator`}
				>
					<span className={menuCheckboxThumbStyles} />
				</span>
				{children}
			</MenuPrimitive.CheckboxItem>
		);
	}

	function MenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
		return (
			<MenuPrimitive.RadioGroup data-slot={`${slot}-radio-group`} {...props} />
		);
	}

	function MenuRadioItem({
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
				data-slot={`${slot}-radio-item`}
				data-inset={inset}
				className={cn(
					// A hidden indicator takes its clearance with it: the choice
					// layout's trailing space is room for the indicator.
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
						data-slot={`${slot}-radio-item-indicator`}
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
	// shared SegmentedControl, with the menu's radio semantics and keyboard
	// model. Group it in this menu's radio group carrying `segmentedGroupStyles`.
	function MenuSegmentedItem({
		className,
		...props
	}: MenuPrimitive.RadioItem.Props) {
		return (
			<MenuPrimitive.RadioItem
				data-slot={`${slot}-segmented-item`}
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

	function MenuSeparator({
		className,
		...props
	}: MenuPrimitive.Separator.Props) {
		return (
			<MenuPrimitive.Separator
				data-slot={`${slot}-separator`}
				className={cn(menuSeparatorStyles, className)}
				{...props}
			/>
		);
	}

	function MenuShortcut({
		className,
		children,
		...props
	}: Omit<React.ComponentProps<"span">, "children"> & {
		readonly children: string;
	}) {
		return (
			<span
				data-slot={`${slot}-shortcut`}
				className={cn(menuShortcutStyles, className)}
				{...props}
			>
				<ShortcutKeys shortcut={children} />
			</span>
		);
	}

	return {
		CheckboxItem: MenuCheckboxItem,
		Content: MenuContent,
		Group: MenuGroup,
		Item: MenuItem,
		Label: MenuLabel,
		Portal: MenuPortal,
		RadioGroup: MenuRadioGroup,
		RadioItem: MenuRadioItem,
		SegmentedItem: MenuSegmentedItem,
		Separator: MenuSeparator,
		Shortcut: MenuShortcut,
		Sub: MenuSub,
		SubContent: MenuSubContent,
		SubTrigger: MenuSubTrigger,
	};
}
