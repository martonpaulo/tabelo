import { floatingSurfaceStyles } from "@tabelo/ui/components/surface-styles";
import { cn } from "@tabelo/ui/lib/utils";
import {
	IconAlertOctagon,
	IconAlertTriangle,
	IconInfoCircle,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { NoticeSeverity } from "@/state/notice-queue";

// One shape for "here is something you should know, and here is what you can
// do about it". See docs/design-system/5-layout.md. The download chooser reuses it
// so a warning reads the same wherever it appears, inline inside a dialog or
// floating over the workspace.
//
// Severity is what the message means, not where it came from: a failure looks
// like a failure whichever producer raised it. Announcing is deliberately not
// this component's job. A live region has to exist before its text does, so
// the app mounts one pair for every notice: see ./live-region.tsx.

// Severity is carried by an icon in its own colour on a neutral surface, not
// by a tinted block (owner, 2026-09-19): the shape says "notice", the icon says
// how serious, and a symbol never depends on colour alone.
const severityIcon: Record<NoticeSeverity, typeof IconInfoCircle> = {
	info: IconInfoCircle,
	warning: IconAlertTriangle,
	error: IconAlertOctagon,
};

const severityTone: Record<NoticeSeverity, string> = {
	info: "text-selection-edge",
	warning: "text-status-warning",
	error: "text-destructive",
};

export function Notice({
	severity,
	floating = false,
	className,
	children,
}: {
	readonly severity: NoticeSeverity;
	// A notice that floats over the workspace instead of sitting inside a
	// surface that already has one. It gets the opaque base the severity tint
	// needs over a table, plus the shadow every floating layer here carries.
	readonly floating?: boolean;
	readonly className?: string;
	readonly children: ReactNode;
}) {
	const Icon = severityIcon[severity];
	return (
		<div
			// The severity is readable from the DOM so that behaviour depending on
			// it can be verified without asserting a colour.
			data-severity={severity}
			className={cn(
				"rounded-surface",
				floating && floatingSurfaceStyles,
				className,
			)}
		>
			<div
				className={cn(
					"flex items-start gap-3 rounded-surface p-3 text-sm",
					!floating && "bg-muted",
				)}
			>
				{/* Centred on the first line of text, so icon, message, and close
				    button share one line however many lines the message takes. */}
				<span className="flex h-5 shrink-0 items-center">
					<Icon
						aria-hidden
						className={cn("size-4.5", severityTone[severity])}
					/>
				</span>
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
					{children}
				</div>
			</div>
		</div>
	);
}
