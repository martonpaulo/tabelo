import { cn } from "@tabelo/ui/lib/utils";
import type { ReactNode } from "react";

// The two working surfaces share one frame so they read as siblings rather
// than as two apps stitched together. Compound by design: the header's
// contents are slotted, not configured through props.
// See docs/design-system.md §3.

function PanelRoot({
	children,
	className,
	...props
}: React.ComponentProps<"section">) {
	return (
		<section
			className={cn(
				"flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface-panel",
				className,
			)}
			{...props}
		>
			{children}
		</section>
	);
}

function PanelHeader({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<header
			className={cn(
				"flex h-panel-header shrink-0 items-center gap-1.5 border-line-subtle border-b bg-surface-header px-3",
				className,
			)}
		>
			{children}
		</header>
	);
}

function PanelTitle({ children }: { children: ReactNode }) {
	return (
		<h2 className="shrink-0 font-medium text-muted-foreground text-xs uppercase tracking-wider">
			{children}
		</h2>
	);
}

function PanelSpacer() {
	return <div aria-hidden className="flex-1" />;
}

function PanelBody({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("relative min-h-0 flex-1 overflow-auto", className)}>
			{children}
		</div>
	);
}

function PanelFooter({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<footer
			className={cn(
				"flex min-h-control-md shrink-0 items-center gap-1.5 border-line-subtle border-t px-3 py-1.5",
				className,
			)}
		>
			{children}
		</footer>
	);
}

export const Panel = Object.assign(PanelRoot, {
	Header: PanelHeader,
	Title: PanelTitle,
	Spacer: PanelSpacer,
	Body: PanelBody,
	Footer: PanelFooter,
});
