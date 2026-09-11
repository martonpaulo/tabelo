import { Button } from "@tabelo/ui/components/button";
import { DialogClose, DialogFooter } from "@tabelo/ui/components/dialog";
import { cn } from "@tabelo/ui/lib/utils";
import type * as React from "react";
import { ControlTooltip } from "./control-tooltip";

// docs/design-system.md §3 "Button hierarchy": Confirm is the filled default,
// destructive Confirm is `destructive`, Cancel is the borderless `ghost`.
// These wrappers exist so a dialog footer cannot drift from that rule.

// One right-aligned row while it fits. Below the small breakpoint a row of
// three labelled actions is wider than a phone, so the actions stack at full
// width in the same DOM and focus order, the decisive one still last.
export function DialogActions({
	className,
	...props
}: React.ComponentProps<typeof DialogFooter>) {
	return (
		<DialogFooter
			data-slot="dialog-actions"
			className={cn("max-sm:flex-col max-sm:items-stretch", className)}
			{...props}
		/>
	);
}

export function DialogCancel({
	...props
}: Omit<React.ComponentProps<typeof DialogClose>, "render">) {
	return (
		<DialogClose
			{...props}
			data-slot="dialog-cancel"
			data-variant="ghost"
			render={<Button variant="ghost" />}
		/>
	);
}

export function DialogConfirm({
	destructive = false,
	disabledReason,
	...props
}: Omit<
	React.ComponentProps<typeof Button>,
	"variant" | "size" | "disabled" | "focusableWhenDisabled"
> & {
	readonly destructive?: boolean;
	readonly disabledReason?: string;
}) {
	const variant = destructive ? "destructive" : "default";
	const unavailable = disabledReason !== undefined;

	return (
		<ControlTooltip reason={disabledReason}>
			<Button
				{...props}
				disabled={unavailable}
				// A native `disabled` button is unfocusable, so its reason would
				// only ever reach a pointer. Base UI keeps the element in the tab
				// order, reports `aria-disabled`, and still swallows click, Enter,
				// and Space, so the shared tooltip opens from the keyboard too.
				// https://base-ui.com/react/components/button
				focusableWhenDisabled={unavailable}
				data-slot="dialog-confirm"
				data-variant={variant}
				variant={variant}
			/>
		</ControlTooltip>
	);
}

// An ordinary alternative can be unavailable too, with the same written reason
// and keyboard reach as Confirm above.
export function DialogAlternative({
	disabledReason,
	...props
}: Omit<
	React.ComponentProps<typeof Button>,
	"variant" | "size" | "disabled" | "focusableWhenDisabled"
> & {
	readonly disabledReason?: string;
}) {
	const unavailable = disabledReason !== undefined;
	return (
		<ControlTooltip reason={disabledReason}>
			<Button
				{...props}
				disabled={unavailable}
				focusableWhenDisabled={unavailable}
				data-variant="ghost"
				variant="ghost"
			/>
		</ControlTooltip>
	);
}
