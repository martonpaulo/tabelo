import { cn } from "@tabelo/ui/lib/utils";
import { memo } from "react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { GridPaneActions } from "@/ui/grid/grid-pane-actions";
import { Panel } from "@/ui/primitives/panel";
import { StatusPill, type StatusTone } from "@/ui/primitives/status-pill";
import { getView } from "@/views/registry";
import { gridAreaStyle, type WorkspacePane } from "@/workspace/layout";
import { PaneContent } from "./pane-content";
import { ViewPicker } from "./view-picker";

// One pane frame for every view. The header carries only what belongs to this
// pane: which view it shows, and the state of that view. Document-level
// actions live in the app header instead — see docs/design-system.md §5.

interface PaneSourceProps {
	readonly paneId: string;
	readonly viewId: string;
}

function SourceStatus({ paneId, viewId }: PaneSourceProps) {
	const owns = useTabeloStore(
		(state) => state.draft?.paneId === paneId && state.draft.viewId === viewId,
	);
	const invalid = useTabeloStore((state) => state.issues.length > 0);

	if (!owns) {
		return (
			<StatusPill
				tone="ok"
				label={copy.status.synced}
				hint={copy.status.syncedHint}
			/>
		);
	}
	const tone: StatusTone = invalid ? "invalid" : "pending";
	return (
		<StatusPill
			tone={tone}
			label={invalid ? copy.status.invalid : copy.status.typing}
			hint={invalid ? copy.status.invalidHint : copy.status.typingHint}
		/>
	);
}

function SourceIssue({ paneId, viewId }: PaneSourceProps) {
	const owns = useTabeloStore(
		(state) => state.draft?.paneId === paneId && state.draft.viewId === viewId,
	);
	const issue = useTabeloStore(
		(state) => state.issues[0] ?? state.warnings[0] ?? null,
	);
	const isError = useTabeloStore((state) => state.issues.length > 0);

	if (!owns || !issue) return null;

	return (
		<p
			className={cn(
				"truncate text-xs",
				isError ? "text-status-invalid" : "text-muted-foreground",
			)}
		>
			{issue.line !== undefined ? `Line ${issue.line}: ` : null}
			{issue.message}
		</p>
	);
}

interface PaneProps {
	readonly pane: WorkspacePane;
	readonly active: boolean;
	// A pane occupying a single slot has half the width, so its header labels
	// shorten rather than wrap.
	readonly compact: boolean;
}

export const Pane = memo(function Pane({ pane, active, compact }: PaneProps) {
	const view = getView(pane.view);

	return (
		<Panel
			aria-label={copy.a11y.pane(view.label)}
			style={{ gridArea: gridAreaStyle(pane.slots) }}
			className={cn(
				"min-w-0",
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
				<ViewPicker
					value={pane.view}
					compact={compact}
					onChange={(next) =>
						useTabeloStore.getState().setPaneView(pane.id, next)
					}
				/>
				<Panel.Spacer />
				{view.kind === "grid" ? <GridPaneActions compact={compact} /> : null}
				{!view.capabilities.editable ? (
					<span className="shrink-0 text-muted-foreground text-xs">
						{copy.workspace.readOnly}
					</span>
				) : null}
				{view.kind === "source" && view.capabilities.editable ? (
					<SourceStatus paneId={pane.id} viewId={pane.view} />
				) : null}
			</Panel.Header>

			<Panel.Body
				className={view.kind === "source" ? "overflow-hidden" : undefined}
			>
				<PaneContent paneId={pane.id} view={view} />
			</Panel.Body>

			{view.kind === "source" ? (
				<PaneIssueRow>
					<SourceIssue paneId={pane.id} viewId={pane.view} />
				</PaneIssueRow>
			) : null}
		</Panel>
	);
});

// The message row is always present so a parse error never changes the pane's
// height — layout stability outranks tidiness. See docs/design-system.md §4.
function PaneIssueRow({ children }: { readonly children: React.ReactNode }) {
	return (
		<div className="flex h-6 shrink-0 items-center border-line-subtle border-t px-3">
			{children}
		</div>
	);
}
