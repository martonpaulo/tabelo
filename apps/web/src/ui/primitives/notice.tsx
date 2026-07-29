import { cn } from "@tabelo/ui/lib/utils";
import type { ReactNode } from "react";

// One shape for "here is something you should know, and here is what you can
// do about it". It sits in the layout rather than floating over the table.
// See docs/design-system.md §5. The download chooser reuses it so a
// warning reads the same wherever it appears.

export type NoticeTone = "info" | "warning";

export function Notice({
	tone,
	className,
	children,
}: {
	readonly tone: NoticeTone;
	readonly className?: string;
	readonly children: ReactNode;
}) {
	return (
		<div
			role="status"
			className={cn(
				"flex flex-wrap items-center gap-2 rounded-surface px-3 py-2 text-sm",
				tone === "warning" ? "bg-destructive/10" : "bg-surface-header",
				className,
			)}
		>
			{children}
		</div>
	);
}
