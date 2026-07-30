import { cn } from "@tabelo/ui/lib/utils";
import type { ReactNode } from "react";
import type { NoticeSeverity } from "@/state/notice-queue";

// One shape for "here is something you should know, and here is what you can
// do about it". It sits in the layout rather than floating over the table.
// See docs/design-system.md §5. The download chooser reuses it so a
// warning reads the same wherever it appears.
//
// Severity is what the message means, not where it came from: a failure looks
// like a failure whichever producer raised it. Announcing is deliberately not
// this component's job. A live region has to exist before its text does, so
// the app mounts one pair for every notice: see ./live-region.tsx.

const severitySurface: Record<NoticeSeverity, string> = {
	info: "bg-surface-header",
	// Warning and error share the one status surface this design line has.
	// They differ in how they are announced and in whether they may expire on
	// their own, not in how loud they look. See docs/design-system.md §4.
	warning: "bg-destructive/10",
	error: "bg-destructive/10",
};

export function Notice({
	severity,
	className,
	children,
}: {
	readonly severity: NoticeSeverity;
	readonly className?: string;
	readonly children: ReactNode;
}) {
	return (
		<div
			// The severity is readable from the DOM so that behaviour depending on
			// it can be verified without asserting a colour.
			data-severity={severity}
			className={cn(
				"flex flex-wrap items-center gap-2 rounded-surface px-3 py-2 text-sm",
				severitySurface[severity],
				className,
			)}
		>
			{children}
		</div>
	);
}
