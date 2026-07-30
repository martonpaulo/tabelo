import { cn } from "@tabelo/ui/lib/utils";
import { forwardRef, type ReactNode } from "react";

// The two working surfaces share one frame so they read as siblings rather
// than as two apps stitched together. Compound by design: the header's
// contents are slotted, not configured through props.
// See docs/design-system.md §3.

const PanelRoot = forwardRef<HTMLElement, React.ComponentProps<"section">>(
	function PanelRoot({ children, className, onKeyDown, ...props }, ref) {
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: pane focus ring requires this
			<section
				ref={ref}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: pane focus ring requires this
				tabIndex={0}
				className={cn(
					"relative isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-surface bg-surface-panel ring-1 ring-line-subtle focus-visible:outline-2 focus-visible:outline-selection-edge focus-visible:-outline-offset-2",
					className,
				)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && event.target === event.currentTarget) {
						event.preventDefault();
						const target = event.currentTarget.querySelector(
							'[data-cell][tabindex="0"], [role="gridcell"][tabindex="0"], [role="textbox"], [data-pane-content] [tabindex]:not([tabindex="-1"]), button:not([disabled])',
						) as HTMLElement | null;
						target?.focus();
					}
					if (event.key === "Escape" && !event.defaultPrevented) {
						event.preventDefault();
						event.currentTarget.focus();
					}
					onKeyDown?.(event);
				}}
				{...props}
			>
				{children}
			</section>
		);
	},
);

function PanelOverlay({ className }: { readonly className?: string }) {
	return <div aria-hidden className={cn("pointer-events-none", className)} />;
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

function PanelSpacer() {
	return <div aria-hidden className="flex-1" />;
}

function PanelBody({
	children,
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="panel-body"
			className={cn(
				"tabelo-scroll-boundary relative min-h-0 flex-1 overflow-auto",
				className,
			)}
			{...props}
		>
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
				"flex min-h-control-md shrink-0 items-center gap-1.5 bg-surface-header px-3 py-1.5",
				className,
			)}
		>
			{children}
		</footer>
	);
}

export const Panel = Object.assign(PanelRoot, {
	Header: PanelHeader,
	Spacer: PanelSpacer,
	Body: PanelBody,
	Footer: PanelFooter,
	Overlay: PanelOverlay,
});
