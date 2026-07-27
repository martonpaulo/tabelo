import { cn } from "@tabelo/ui/lib/utils";

// Synchronization state has to be visible without being loud. Colour carries
// the signal, but never alone — each state also has a written label, so the
// meaning survives a colour-vision difference or a grayscale screen.
// See docs/design-system.md §2 and §9.

export type StatusTone = "ok" | "pending" | "invalid";

const dotColor: Record<StatusTone, string> = {
	ok: "bg-status-ok",
	pending: "bg-status-pending",
	invalid: "bg-status-invalid",
};

interface StatusPillProps {
	readonly tone: StatusTone;
	readonly label: string;
	readonly hint?: string;
}

export function StatusPill({ tone, label, hint }: StatusPillProps) {
	return (
		<span
			title={hint}
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 text-xs",
				tone === "invalid" ? "text-status-invalid" : "text-muted-foreground",
			)}
		>
			<span aria-hidden className={cn("size-1.5 shrink-0", dotColor[tone])} />
			{label}
		</span>
	);
}
