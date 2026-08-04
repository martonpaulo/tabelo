import { panelSurfaceStyles } from "@tabelo/ui/components/surface-styles";
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
					`relative isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-surface focus-visible:outline-2 focus-visible:outline-selection-edge focus-visible:-outline-offset-2 ${panelSurfaceStyles}`,
					className,
				)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && event.target === event.currentTarget) {
						event.preventDefault();
						// Entry lands in the pane's content, never on the header's own
						// triggers: those are chrome and sit beside the pane in the
						// workspace ring, so a search over the whole pane would find
						// one of them first and Enter would go nowhere useful.
						const body = event.currentTarget.querySelector<HTMLElement>(
							'[data-slot="panel-body"]',
						);
						if (body) {
							// The grid's focused cell, a source editor, or a view that
							// names its own entry target. Failing all three, the body:
							// a preview has nothing to focus but still has to be
							// scrollable once entered.
							const target =
								body.querySelector<HTMLElement>(
									'[data-grid-active="true"], [role="textbox"], [data-pane-entry]',
								) ??
								body.querySelector<HTMLElement>(
									'[tabindex]:not([tabindex="-1"]), button:not([disabled])',
								) ??
								body;
							target.focus();
						}
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
			// A scrollable container is put in the tab order by the browser itself
			// once its content overflows, which would let Tab fall into the pane
			// from the workspace ring and, by entering it, hand every per-row and
			// per-column control inside back to that ring. An explicit -1 keeps it
			// focusable for entry without making it a tab stop.
			tabIndex={-1}
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

export const Panel = Object.assign(PanelRoot, {
	Header: PanelHeader,
	Spacer: PanelSpacer,
	Body: PanelBody,
});
