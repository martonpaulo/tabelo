"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
	overlayTransitionStyles,
	popupTransitionStyles,
} from "@tabelo/ui/components/motion-styles";

import { floatingSurfaceStyles } from "@tabelo/ui/components/surface-styles";
import { cn } from "@tabelo/ui/lib/utils";
import type * as React from "react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			data-slot="dialog-overlay"
			className={cn(
				"fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
				overlayTransitionStyles,
				className,
			)}
			{...props}
		/>
	);
}

// Two widths and no third (owner, 2026-09-19): `narrow` for a confirmation
// or a short form, `wide` for a chooser that lists options with descriptions.
// A dialog picks one; it never sizes itself with a width class of its own, so
// two dialogs of the same kind open at the same width.
const dialogWidthStyles = {
	narrow: "sm:w-md",
	wide: "sm:w-lg",
} as const;

// No built-in close button: every Tabelo dialog ends in its own labelled
// actions, and a corner icon would need an accessible name this package
// cannot own (docs/design-system.md section 8).
function DialogContent({
	className,
	children,
	width = "narrow",
	...props
}: DialogPrimitive.Popup.Props & {
	readonly width?: keyof typeof dialogWidthStyles;
}) {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Popup
				data-slot="dialog-content"
				data-width={width}
				className={cn(
					`fixed top-1/2 left-1/2 z-50 grid max-h-screen-fit-h w-full max-w-screen-fit-w -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-surface p-6 text-popover-foreground text-sm/relaxed outline-none ${floatingSurfaceStyles}`,
					dialogWidthStyles[width],
					popupTransitionStyles,
					className,
				)}
				{...props}
			>
				{children}
			</DialogPrimitive.Popup>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn("flex flex-col gap-1 text-left", className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn("mt-4 flex flex-nowrap justify-end gap-2", className)}
			{...props}
		/>
	);
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn("font-semibold text-lg", className)}
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: DialogPrimitive.Description.Props) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn(
				"text-muted-foreground text-sm/relaxed *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
