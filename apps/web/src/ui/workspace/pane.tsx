import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { cn } from "@tabelo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { memo } from "react";
import type { ParseIssue } from "@/formats/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { GridPaneActions } from "@/ui/grid/grid-pane-actions";
import { Panel } from "@/ui/primitives/panel";
import { StatusPill } from "@/ui/primitives/status-pill";
import { sourceFeedbackIds } from "@/ui/source/source-feedback";
import { navigateToSourceLine } from "@/ui/source/source-navigation";
import { getView } from "@/views/registry";
import { gridAreaStyle, type WorkspacePane } from "@/workspace/layout";
import { PaneContent } from "./pane-content";
import { PaneIdentity, PaneMenu } from "./pane-menu";

// One pane frame for every view. The header carries only what belongs to this
// pane: which view it shows, and the state of that view. Document-level
// actions live in the app header instead — see docs/design-system.md §5.

interface PaneSourceProps {
	readonly paneId: string;
	readonly viewId: string;
}

function SourceStatus({ paneId, viewId }: PaneSourceProps) {
	const status = useTabeloStore((state) =>
		state.draft?.paneId === paneId && state.draft.viewId === viewId
			? state.draft.status
			: null,
	);
	if (status !== "invalid") return null;
	return (
		<StatusPill
			tone="invalid"
			label={copy.status.invalid}
			hint={copy.status.invalidFeedback}
		/>
	);
}

function SourceIssue({ paneId, viewId }: PaneSourceProps) {
	const draft = useTabeloStore((state) => {
		const draft = state.draft;
		if (draft?.paneId !== paneId || draft.viewId !== viewId) return null;
		return draft;
	});
	const feedback: {
		readonly kind: "issue" | "warning";
		readonly details: readonly ParseIssue[];
		readonly error: boolean;
	} | null =
		draft?.status === "invalid"
			? {
					kind: "issue",
					details: draft.issues,
					error: true,
				}
			: draft?.warnings.length
				? {
						kind: "warning",
						details: draft.warnings,
						error: false,
					}
				: null;

	if (!feedback) return null;

	const primaryDetail = feedback.details[0];
	if (!primaryDetail) return null;

	const ids = sourceFeedbackIds(paneId);
	const primary = copy.source.issue(primaryDetail);
	const description = feedback.error
		? `${copy.status.invalidFeedback} ${primary}`
		: primary;

	return (
		<div className="absolute inset-x-2 bottom-2 z-10 flex min-h-control-md items-center gap-1.5 rounded-interactive bg-surface-header px-2 shadow-md">
			{feedback.error ? (
				<span
					id={ids.announcement}
					role="status"
					aria-live="polite"
					aria-atomic="true"
					className="sr-only"
				>
					{copy.status.invalidFeedback}
				</span>
			) : null}
			<p
				id={ids.description}
				title={primary}
				className={cn(
					"min-w-0 flex-1 truncate text-sm",
					feedback.error ? "text-status-invalid" : "text-muted-foreground",
				)}
			>
				<span className="sr-only">{description}</span>
				<span aria-hidden>{primary}</span>
			</p>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="xs"
							aria-label={copy.source.showFeedback(
								feedback.kind,
								feedback.details.length,
							)}
							aria-controls={ids.list}
						/>
					}
				>
					{copy.source.details}
					<ChevronDown aria-hidden />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					id={ids.list}
					align="end"
					side="top"
					className="w-auto min-w-60 max-w-xs"
				>
					{feedback.error ? (
						<DropdownMenuLabel className="whitespace-normal">
							{copy.status.invalidFeedback}
						</DropdownMenuLabel>
					) : null}
					{feedback.details.map((detail, index) => (
						<DropdownMenuItem
							key={`${detail.code}-${detail.line ?? "source"}-${index}`}
							className="whitespace-normal"
							onClick={() => {
								const line = detail.line;
								if (line !== undefined) {
									// Base UI restores focus to the trigger as the menu closes.
									// Move to the requested line on the next frame so the explicit
									// navigation remains the final focus destination.
									requestAnimationFrame(() =>
										navigateToSourceLine(paneId, line),
									);
								}
							}}
						>
							{copy.source.issue(detail)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

interface PaneProps {
	readonly pane: WorkspacePane;
	readonly active: boolean;
	// A pane occupying a single slot has half the width, so its header labels
	// shorten rather than wrap.
	readonly compact: boolean;
	// Stacked, the pane takes the full width in reading order and must not name
	// a slot: an inline grid area pointing at column two would conjure that
	// column back into existence.
	readonly stacked: boolean;
}

export const Pane = memo(function Pane({
	pane,
	active,
	compact,
	stacked,
}: PaneProps) {
	const view = getView(pane.view);

	return (
		<Panel
			aria-label={copy.a11y.pane(view.label)}
			style={stacked ? undefined : { gridArea: gridAreaStyle(pane.slots) }}
			className={cn(
				"min-w-0",
				// Tall enough to be worth scrolling to, and still allowed to grow
				// when it is the only pane on screen.
				stacked && "min-h-pane-stack flex-1",
				active && "ring-1 ring-selection-edge/40 ring-inset",
			)}
			onPointerDownCapture={() => {
				if (!active) useTabeloStore.getState().setActivePane(pane.id);
			}}
			onFocusCapture={() => {
				if (!active) useTabeloStore.getState().setActivePane(pane.id);
			}}
		>
			<Panel.Header className="overflow-x-auto">
				<PaneIdentity view={view} compact={compact} />
				<Panel.Spacer />
				{view.kind === "grid" ? <GridPaneActions compact={compact} /> : null}
				{view.kind === "source" && view.capabilities.editable ? (
					<SourceStatus paneId={pane.id} viewId={pane.view} />
				) : null}
				<PaneMenu paneId={pane.id} view={view} compact={compact} />
			</Panel.Header>

			{/* Content scale is published to the body and nowhere else, so a zoomed
			    pane keeps its header, controls, and focus targets at full size. */}
			<Panel.Body
				style={{ "--pane-zoom": pane.zoom } as React.CSSProperties}
				className={view.kind === "source" ? "overflow-hidden" : undefined}
			>
				<PaneContent paneId={pane.id} view={view} zoom={pane.zoom} />
				{view.kind === "source" ? (
					<SourceIssue paneId={pane.id} viewId={pane.view} />
				) : null}
			</Panel.Body>
		</Panel>
	);
});
