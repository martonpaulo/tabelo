import { Button } from "@tabelo/ui/components/button";
import { DialogClose } from "@tabelo/ui/components/dialog";
import type * as React from "react";

// docs/design-system.md §3 "Button hierarchy": Confirm is the filled default,
// destructive Confirm is `destructive`, Cancel is the borderless `ghost`.
// These wrappers exist so a dialog footer cannot drift from that rule.

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
	...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size"> & {
	readonly destructive?: boolean;
}) {
	const variant = destructive ? "destructive" : "default";

	return (
		<Button
			{...props}
			data-slot="dialog-confirm"
			data-variant={variant}
			variant={variant}
		/>
	);
}
