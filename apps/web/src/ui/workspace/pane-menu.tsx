import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	menuInlineItemStyles,
	segmentedGroupStyles,
} from "@tabelo/ui/components/menu-styles";
import { cn } from "@tabelo/ui/lib/utils";
import {
	ChevronDown,
	ClipboardCopy,
	Move as MoveIcon,
	Replace,
	RotateCcw,
	Ruler,
	Search,
	WrapText,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useRef } from "react";
import { copy } from "@/copy/copy";
import { canSerialize } from "@/formats";
import { useTabeloStore, visibleTextForPane } from "@/state/store";
import {
	copyFormattedTableToClipboard,
	copyToClipboard,
} from "@/ui/clipboard-actions";
import { preconditionRecovery } from "@/ui/precondition-recovery";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { RecoveryMenuItem } from "@/ui/primitives/recovery-command";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import type { ViewDefinition } from "@/views/types";
import { smallerLayout } from "@/workspace/layout";
import {
	DEFAULT_PANE_ZOOM,
	MAX_PANE_ZOOM,
	MIN_PANE_ZOOM,
	paneZoomPercent,
	stepPaneZoom,
} from "@/workspace/zoom";

interface PaneIdentityProps {
	readonly view: ViewDefinition;
	readonly compact: boolean;
}

// The heading identifies the pane and does nothing else. Change view is a pane
// command in the trailing actions menu, so identity does not masquerade as a
// dropdown trigger.
export function PaneIdentity({ view, compact }: PaneIdentityProps) {
	const Icon = view.icon;

	return (
		<h2 className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
			<Icon aria-hidden className="shrink-0 text-muted-foreground" />
			<span className="truncate">{compact ? view.shortLabel : view.label}</span>

			{view.capabilities.editable ? null : (
				<span className="shrink-0 rounded-interactive bg-surface-panel px-1.5 py-0.5 font-normal text-muted-foreground text-xs ring-1 ring-line-subtle">
					{copy.workspace.readOnly}
				</span>
			)}
		</h2>
	);
}

export function PaneMenu({
	paneId,
	view,
	onChangeView,
	onMovePane,
	assistanceEnabled,
	onAssistanceChange,
}: {
	readonly paneId: string;
	readonly view: ViewDefinition;
	readonly onChangeView: (opener: HTMLButtonElement | null) => void;
	readonly onMovePane: (opener: HTMLButtonElement | null) => void;
	// The pane's structural-assistance switch (#297). Offered only when the
	// view's format declares a feature and the view can be typed into.
	readonly assistanceEnabled: boolean;
	readonly onAssistanceChange: (enabled: boolean) => void;
}) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuDialog = useMenuDialogCommand();
	const zoom = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId)?.zoom ??
			DEFAULT_PANE_ZOOM,
	);
	const wrap = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId)?.wrap ?? false,
	);
	const canClose = useTabeloStore(
		(state) => smallerLayout(state.workspace.layout) !== undefined,
	);
	const canMove = useTabeloStore((state) => state.workspace.panes.length > 1);
	const columnWrap = useTabeloStore((state) => {
		const wrapped = state.workspace.wrappedColumns.length;
		if (wrapped === 0) return "none";
		return wrapped >= state.document.columns.length ? "all" : "some";
	});
	const document = useTabeloStore((state) => state.document);
	const currentViewFailure = view.codec
		? canSerialize(view.codec, document)
		: null;
	const recovery = preconditionRecovery(currentViewFailure);
	const offersAssistance =
		view.capabilities.editable &&
		view.codec?.structuralAssistance !== undefined;
	const canCopy =
		view.capabilities.textClipboard ||
		(view.capabilities.structuredClipboard &&
			!view.capabilities.tableOperations);

	const setZoom = (next: number) =>
		useTabeloStore.getState().setPaneZoom(paneId, next);

	return (
		<DropdownMenu
			open={menuDialog.open}
			onOpenChange={menuDialog.onOpenChange}
			onOpenChangeComplete={menuDialog.onOpenChangeComplete}
		>
			{/* A chevron and nothing else, matching the column affordance. With the
			    view name now carrying the pane's identity beside it, a second
			    labelled button repeated the word "Pane" on every pane at once. The
			    accessible name is the only signal left, so it names the view: with
			    four panes open, "Pane actions" alone would not say which. */}
			<ControlTooltip name={`${copy.workspace.paneActions}: ${view.label}`}>
				<DropdownMenuTrigger
					render={<Button ref={triggerRef} variant="ghost" size="icon-sm" />}
				>
					<ChevronDown aria-hidden className="opacity-60" />
				</DropdownMenuTrigger>
			</ControlTooltip>

			<DropdownMenuContent align="end" className="w-auto min-w-64">
				{/* Copy leads when this view exposes a clipboard capability. The
				    registry decides both availability and payload; the menu only
				    places the command in the content group. */}
				{canCopy ? (
					<>
						<DropdownMenuGroup>
							<ControlTooltip
								reason={
									currentViewFailure
										? copy.disabled.codecPrecondition(currentViewFailure)
										: undefined
								}
							>
								<DropdownMenuItem
									disabled={currentViewFailure !== null}
									onClick={() => {
										const state = useTabeloStore.getState();
										if (view.capabilities.textClipboard) {
											const visible = visibleTextForPane(
												state,
												paneId,
												view.id,
											);
											if (visible.ok) {
												void copyToClipboard({ text: visible.text }, "source");
											}
										} else {
											void copyFormattedTableToClipboard(state.document);
										}
									}}
								>
									<ClipboardCopy aria-hidden />
									{view.capabilities.textClipboard
										? copy.actions.copySource
										: copy.actions.copyFormattedTable}
								</DropdownMenuItem>
							</ControlTooltip>
							{/* Beside the refused command, never in place of it: the copy
							    item stays disabled and this is a second, ordinary command.
							    See docs/design-system.md §4. */}
							{recovery ? (
								<RecoveryMenuItem
									recovery={recovery}
									target={view.label}
									onRun={menuDialog.runAfterClose}
								/>
							) : null}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
					</>
				) : null}

				{/* The group's label carries the current value, so a screen reader
				    reports the percentage on entering the group and again after each
				    step: the items stay in place and the menu stays open.

				    The group is the live region, not the label. The label renders
				    with role="presentation", and a global ARIA attribute on a
				    presentational element triggers presentational role conflict
				    resolution: the role would be ignored, the element exposed as
				    generic, and the menu would then own a child that is neither a
				    menuitem nor a group. A group is an allowed child, and the only
				    text that changes inside it is the label's, so what the region
				    announces is unchanged.
				    https://w3c.github.io/aria/#conflict_resolution_presentation_none */}
				<DropdownMenuGroup aria-live="polite">
					<DropdownMenuLabel>
						<span aria-hidden>{copy.workspace.zoomLabel}</span>
						<span className="sr-only">
							{copy.workspace.zoom(paneZoomPercent(zoom))}
						</span>
					</DropdownMenuLabel>
					{/* One compact row, out, reset, in, drawn like a segmented group:
					    three commands on one value read better side by side than as
					    three full rows (2026-09-19). Each keeps its name, shortcut
					    hint, and disabled reason. */}
					<div className={cn(segmentedGroupStyles, "mx-1 mb-1")}>
						<ControlTooltip
							reason={
								zoom <= MIN_PANE_ZOOM ? copy.disabled.zoomMinimum : undefined
							}
						>
							<DropdownMenuItem
								aria-label={copy.workspace.zoomOut}
								aria-keyshortcuts={copy.shortcuts.zoomOut}
								closeOnClick={false}
								disabled={zoom <= MIN_PANE_ZOOM}
								onClick={() => setZoom(stepPaneZoom(zoom, -1))}
								className={menuInlineItemStyles}
							>
								<ZoomOut aria-hidden />
							</DropdownMenuItem>
						</ControlTooltip>
						<ControlTooltip
							reason={
								zoom === DEFAULT_PANE_ZOOM
									? copy.disabled.zoomDefault
									: undefined
							}
						>
							<DropdownMenuItem
								aria-label={copy.workspace.resetZoom}
								aria-keyshortcuts={copy.shortcuts.resetZoom}
								closeOnClick={false}
								disabled={zoom === DEFAULT_PANE_ZOOM}
								onClick={() => setZoom(DEFAULT_PANE_ZOOM)}
								className={cn(
									menuInlineItemStyles,
									"data-disabled:opacity-100",
								)}
							>
								<RotateCcw aria-hidden />
								<span aria-hidden>
									{copy.workspace.zoomPercent(paneZoomPercent(zoom))}
								</span>
							</DropdownMenuItem>
						</ControlTooltip>
						<ControlTooltip
							reason={
								zoom >= MAX_PANE_ZOOM ? copy.disabled.zoomMaximum : undefined
							}
						>
							<DropdownMenuItem
								aria-label={copy.workspace.zoomIn}
								aria-keyshortcuts={copy.shortcuts.zoomIn}
								closeOnClick={false}
								disabled={zoom >= MAX_PANE_ZOOM}
								onClick={() => setZoom(stepPaneZoom(zoom, 1))}
								className={menuInlineItemStyles}
							>
								<ZoomIn aria-hidden />
							</DropdownMenuItem>
						</ControlTooltip>
					</div>
				</DropdownMenuGroup>

				{/* Find is keyboard-first, and this is the affordance that keeps it
				    discoverable: §9 does not allow a capability whose only entry point
				    is a chord nobody was told about. It belongs to the pane rather
				    than the app menu because the bar it opens is attached to this
				    pane, and it is offered by view kind, never by view id. */}
				{view.kind === "grid" ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem
								onClick={() => useTabeloStore.getState().openFind()}
							>
								<Search aria-hidden />
								{copy.find.title}
								<DropdownMenuShortcut aria-hidden>
									{copy.shortcuts.find}
								</DropdownMenuShortcut>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							{/* A bulk command over the per-column preference, the grid's
							    counterpart of a source pane's Wrap lines. Checked when every
							    column wraps, and mixed when only some do; choosing it from
							    either state wraps them all (#360). */}
							<DropdownMenuCheckboxItem
								checked={columnWrap === "all"}
								// Only overridden for the mixed state: passing undefined would
								// replace the checked state the primitive states itself.
								{...(columnWrap === "some"
									? { "aria-checked": "mixed" as const }
									: {})}
								closeOnClick={false}
								onCheckedChange={() =>
									useTabeloStore
										.getState()
										.setAllColumnsWrap(columnWrap !== "all")
								}
							>
								<WrapText aria-hidden />
								{copy.workspace.wrapAllColumns}
							</DropdownMenuCheckboxItem>
						</DropdownMenuGroup>
					</>
				) : null}

				{view.kind === "source" ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuCheckboxItem
								checked={wrap}
								closeOnClick={false}
								onCheckedChange={(checked) =>
									useTabeloStore.getState().setPaneWrap(paneId, checked)
								}
							>
								<WrapText aria-hidden />
								{copy.workspace.wrapSource}
							</DropdownMenuCheckboxItem>
							{/* Switching it off makes the buffer plain text until the
							    buffer is gone; it changes no text and adds no history step.
							    See docs/design-system.md, "Structural assistance can
							    always be switched off". */}
							{offersAssistance ? (
								<DropdownMenuCheckboxItem
									checked={assistanceEnabled}
									closeOnClick={false}
									onCheckedChange={onAssistanceChange}
								>
									<Ruler aria-hidden />
									{copy.workspace.structuralAssistance}
								</DropdownMenuCheckboxItem>
							) : null}
						</DropdownMenuGroup>
					</>
				) : null}

				<DropdownMenuSeparator />

				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={() =>
							menuDialog.runAfterClose(() => onChangeView(triggerRef.current))
						}
					>
						<Replace aria-hidden />
						{copy.workspace.changeView}
					</DropdownMenuItem>
					<ControlTooltip
						reason={canMove ? undefined : copy.disabled.moveOnlyView}
					>
						<DropdownMenuItem
							disabled={!canMove}
							onClick={() =>
								menuDialog.runAfterClose(() => onMovePane(triggerRef.current))
							}
						>
							<MoveIcon aria-hidden />
							{copy.workspace.movePane}
						</DropdownMenuItem>
					</ControlTooltip>

					{/* Adding a view is not here. It belongs to the edge a pane would be
					    split along, because that edge is what decides where the new pane
					    lands, and a menu item cannot say which edge it means.
					    See docs/adr/0006. */}
					<ControlTooltip
						reason={canClose ? undefined : copy.disabled.closeOnlyView}
					>
						<DropdownMenuItem
							disabled={!canClose}
							onClick={() => useTabeloStore.getState().closePane(paneId)}
						>
							<X aria-hidden />
							{copy.workspace.closeView}
						</DropdownMenuItem>
					</ControlTooltip>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
