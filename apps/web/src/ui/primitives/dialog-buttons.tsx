import { Button } from "@tabelo/ui/components/button";
import { DialogClose, DialogFooter } from "@tabelo/ui/components/dialog";
import type * as React from "react";
import { DisabledTooltip } from "./disabled-tooltip";

// docs/design-system.md §3 "Button hierarchy": Confirm is the filled default,
// destructive Confirm is `destructive`, Cancel is the borderless `ghost`.
// These wrappers exist so a dialog footer cannot drift from that rule.

export function DialogActions({
	...props
}: React.ComponentProps<typeof DialogFooter>) {
	return <DialogFooter data-slot="dialog-actions" {...props} />;
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
	"variant" | "size" | "disabled"
> & {
	readonly destructive?: boolean;
	readonly disabledReason?: string;
}) {
	const variant = destructive ? "destructive" : "default";

	return (
		<DisabledTooltip reason={disabledReason}>
			<Button
				{...props}
				disabled={disabledReason !== undefined}
				data-slot="dialog-confirm"
				data-variant={variant}
				variant={variant}
			/>
		</DisabledTooltip>
	);
}

export function DialogAlternative({
	...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size">) {
	return <Button {...props} data-variant="ghost" variant="ghost" />;
}
