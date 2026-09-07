"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";
import { CheckIcon } from "lucide-react";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			// Base UI 1.6 renders this root as a non-native <span role="checkbox">
			// beside a hidden, tabindex="-1" input, and the tabIndex its own button
			// behaviour computes reaches that span only in some placements: the
			// download dialog's options had no tabindex at all while the settings
			// dialog's had one, from this same wrapper. Its Space activation always
			// arrives, so the missing focus stop alone left a control operable only
			// by pointer. Set it here so it does not depend on the placement, before
			// the spread so a caller can still override it, and keep Base UI's
			// not-focusable-when-disabled default.
			// https://base-ui.com/react/components/checkbox
			tabIndex={props.disabled ? -1 : 0}
			className={cn(
				"peer relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-interactive border border-control-outline bg-transparent outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 group-has-disabled/field:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-disabled:cursor-not-allowed data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-disabled:opacity-50 dark:data-checked:bg-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				controlStateTransitionStyles,
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
			>
				<CheckIcon />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
