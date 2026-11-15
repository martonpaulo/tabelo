import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"min-h-control-lg rounded-interactive border-input placeholder:text-muted-foreground disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80 flex field-sizing-content w-full resize-none border bg-transparent px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1",
				controlStateTransitionStyles,
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
