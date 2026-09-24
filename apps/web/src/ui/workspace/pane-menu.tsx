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
	IconAdjustmentsHorizontal,
	IconArrowAutofitWidth,
	IconArrowsMove,
	IconChevronDown,
	IconClipboardCopy,
	IconLock,
	IconReplace,
	IconRotate,
	IconRuler,
	IconSearch,
	IconTextWrap,
	IconX,
	IconZoomIn,
	IconZoomOut,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { copy } from "@/copy/copy";
import { canSerialize } from "@/formats";
import { usePreferences } from "@/preferences/use-preferences";
import { useTabeloStore, visibleTextForPane } from "@/state/store";
import {
	copyFormattedTableToClipboard,
	copyToClipboard,
} from "@/ui/clipboard-actions";
import {
	measureColumnFitWidths,
	measurePaneColumnRoom,
} from "@/ui/grid/column-fit";
import { preconditionRecovery } from "@/ui/precondition-recovery";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { RecoveryMenuItem } from "@/ui/primitives/recovery-command";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import { paneSpelling } from "@/ui/spelling";
import { paneSelector } from "@/ui/workspace/pane-selector";
import type { ViewDefinition } from "@/views/types";
import { smallerLayout } from "@/workspace/layout";
import {
	INHERIT_SOURCE_DISPLAY,
	resolveSourceDisplay,
} from "@/workspace/source-display";
import {
	DEFAULT_PANE_ZOOM,
	MAX_PANE_ZOOM,
	MIN_PANE_ZOOM,
	paneZoomPercent,
	paneZoomToFit,
	stepPaneZoom,
} from "@/workspace/zoom";
import { PaneDisplayDialog } from "./pane-display-dialog";
import { usePaneFind } from "./use-pane-find";

interface PaneIdentityProps {
	readonly view: ViewDefinition;
}

// The heading identifies the pane and does nothing else. Change view is a pane
// command in the trailing actions menu, so identity does not masquerade as a
// dropdown trigger. A view has one name everywhere, so a narrow pane truncates
// it with an ellipsis rather than switching to a second, shorter name (owner,
// 2026-09-19).
export function PaneIdentity({ view }: PaneIdentityProps) {
	const Icon = view.icon;

	return (
		<h2 className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
			<Icon aria-hidden className="shrink-0 text-muted-foreground" />
			<span className="truncate">{view.label}</span>

			{/* A quiet lock with the words in its tooltip and accessible name,
			    rather than an outlined chip (owner, 2026-09-19). */}
			{view.capabilities.editable ? null : (
				<ControlTooltip name={copy.workspace.readOnly}>
					<span
						role="img"
						aria-label={copy.workspace.readOnly}
						className="inline-flex shrink-0 text-muted-foreground"
					>
						<IconLock aria-hidden className="size-3.5" />
					</span>
				</ControlTooltip>
			)}
		</h2>
	);
}

// The grid surface of one pane, and the room its columns have. Read when the
// command runs rather than watched: nothing else needs the number.
function fitColumnsToPane(paneId: string): void {
	const pane = document.querySelector<HTMLElement>(paneSelector(paneId));
	const surface = pane?.querySelector<HTMLElement>("[data-grid-surface]");
	const table = pane?.querySelector("table");
	const store = useTabeloStore.getState();
	const zoom =
		store.workspace.panes.find((candidate) => candidate.id === paneId)?.zoom ??
		DEFAULT_PANE_ZOOM;
	const room = surface ? measurePaneColumnRoom(surface, zoom) : undefined;
	if (room === undefined || !table) {
		store.announceStatus(copy.status.fitColumnsUnavailable);
		return;
	}
	// What each column needs for its own content is the proportion to spread,
	// so a column of long values ends up wider than a column of short ones
	// instead of every column inheriting whatever width it happens to have
	// (owner, 2026-09-20).
	const content = measureColumnFitWidths(
		table,
		store.document.columns.length,
		zoom,
	);
	if (!store.fitColumnsToPaneWidth(room, content)) {
		store.announceStatus(copy.status.fitColumnsUnchanged);
	}
}

// The same command in a view whose columns are its text rather than stored
// widths: nothing may pad the file to fill a pane, so the pane scales instead
// until the widest line fits (owner, 2026-09-20). Presentation only, like
// every other zoom step.
function fitPaneZoomToWidth(paneId: string): void {
	const pane = document.querySelector<HTMLElement>(paneSelector(paneId));
	const store = useTabeloStore.getState();
	const zoom =
		store.workspace.panes.find((candidate) => candidate.id === paneId)?.zoom ??
		DEFAULT_PANE_ZOOM;
	const scroller = pane?.querySelector<HTMLElement>('[data-slot="panel-body"]');
	// The editor's own scroller for a source view, the rendered table for the
	// preview: in both the scroll width is what has to fit.
	const sourceScroller = pane?.querySelector<HTMLElement>(".cm-scroller");
	const content =
		sourceScroller ?? pane?.querySelector<HTMLElement>("table") ?? scroller;
	if (!scroller || !content) {
		store.announceStatus(copy.status.fitColumnsUnavailable);
		return;
	}
	const room = scroller.clientWidth;
	const widest = Math.max(content.scrollWidth, content.clientWidth);
	// Source text scales, but its gutter and trailing room keep their size.
	// Scaling the entire scroll width overestimates the room available to text.
	const line = sourceScroller?.querySelector<HTMLElement>(".cm-line");
	const lineStyle = line ? getComputedStyle(line) : null;
	const fixed = sourceScroller
		? (sourceScroller.querySelector(".cm-gutters")?.getBoundingClientRect()
				.width ?? 0) +
			Number.parseFloat(lineStyle?.paddingLeft ?? "0") +
			Number.parseFloat(lineStyle?.paddingRight ?? "0")
		: 0;
	const next = paneZoomToFit(widest - fixed, room - fixed, zoom);
	if (next === zoom) {
		store.announceStatus(copy.status.fitColumnsUnchanged);
		return;
	}
	store.setPaneZoom(paneId, next);
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
	const paneFind = usePaneFind();
	const menuDialog = useMenuDialogCommand();
	const [displayOpen, setDisplayOpen] = useState(false);
	const zoom = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId)?.zoom ??
			DEFAULT_PANE_ZOOM,
	);
	const overrides = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId) ??
			INHERIT_SOURCE_DISPLAY,
	);
	const { wrap } = resolveSourceDisplay(usePreferences(), overrides);
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
		(view.capabilities.structuredClipboard && !view.capabilities.editable);

	const setZoom = (next: number) =>
		useTabeloStore.getState().setPaneZoom(paneId, next);

	return (
		<>
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
				<ControlTooltip name={copy.workspace.paneActionsFor(view.label)}>
					<DropdownMenuTrigger
						render={<Button ref={triggerRef} variant="ghost" size="icon-sm" />}
					>
						<IconChevronDown aria-hidden className="opacity-60" />
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
													paneSpelling(paneId),
												);
												if (visible.ok) {
													void copyToClipboard(
														{ text: visible.text },
														"source",
													);
												}
											} else {
												void copyFormattedTableToClipboard(state.document);
											}
										}}
									>
										<IconClipboardCopy aria-hidden />
										{view.capabilities.textClipboard
											? copy.actions.copySource
											: copy.actions.copyFormattedTable}
									</DropdownMenuItem>
								</ControlTooltip>
								{/* Beside the refused command, never in place of it: the copy
							    item stays disabled and this is a second, ordinary command.
							    See docs/design-system/4-interaction-states.md. */}
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
									<IconZoomOut aria-hidden />
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
									<IconRotate aria-hidden />
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
									<IconZoomIn aria-hidden />
								</DropdownMenuItem>
							</ControlTooltip>
						</div>
						{/* Fit to pane width, in whichever way the view can (#404).
						    The visual table spreads its stored column widths across
						    the room the pane has, keeping their proportions; a text
						    view or the preview cannot pad a file to fill a pane, so
						    the pane scales until the widest line fits. Either way the
						    pane is measured when the command runs, so a resized window
						    needs no bookkeeping in between. */}
						<DropdownMenuItem
							onClick={() =>
								menuDialog.runAfterClose(() =>
									view.kind === "grid"
										? fitColumnsToPane(paneId)
										: fitPaneZoomToWidth(paneId),
								)
							}
						>
							<IconArrowAutofitWidth aria-hidden />
							{copy.workspace.fitToPaneWidth}
						</DropdownMenuItem>
					</DropdownMenuGroup>

					{/* Find is keyboard-first, and this is the affordance that keeps it
				    discoverable: §9 does not allow a capability whose only entry point
				    is a chord nobody was told about. It belongs to the pane rather
				    than the app menu because the bar it opens is attached to this
				    pane. Every pane has one (#280); its name says whether it can
				    replace, which the view's editability decides. */}
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={paneFind.open}>
							<IconSearch aria-hidden />
							{view.capabilities.editable
								? copy.find.title
								: copy.find.titleReadOnly}
							<DropdownMenuShortcut aria-hidden>
								{copy.shortcuts.find}
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					</DropdownMenuGroup>

					{view.kind === "grid" ? (
						<>
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
									<IconTextWrap aria-hidden />
									{copy.workspace.wrapAllColumns}
								</DropdownMenuCheckboxItem>
							</DropdownMenuGroup>
						</>
					) : null}

					{view.kind === "source" ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								{/* The pane's own answer to the four display settings, and the
							    way back to following Settings (#276, option C). */}
								<DropdownMenuItem
									onClick={() =>
										menuDialog.runAfterClose(() => setDisplayOpen(true))
									}
								>
									<IconAdjustmentsHorizontal aria-hidden />
									{copy.paneDisplay.command}
								</DropdownMenuItem>
								{/* Kept beside Display… as the one-step toggle for the setting a
							    reader flips most while reading. It shows what the pane
							    displays, and choosing it stores the pane's own choice, the
							    same as choosing On or Off in the dialog. */}
								<DropdownMenuCheckboxItem
									checked={wrap}
									closeOnClick={false}
									onCheckedChange={(checked) =>
										useTabeloStore
											.getState()
											.setPaneSourceDisplay(paneId, "wrap", checked)
									}
								>
									<IconTextWrap aria-hidden />
									{copy.workspace.wrapSource}
								</DropdownMenuCheckboxItem>
								{/* Switching it off makes the buffer plain text until the
							    buffer is gone; it changes no text and adds no history step.
							    See docs/design-system/2-tokens.md, "Structural assistance can
							    always be switched off". */}
								{offersAssistance ? (
									<DropdownMenuCheckboxItem
										checked={assistanceEnabled}
										closeOnClick={false}
										onCheckedChange={onAssistanceChange}
									>
										<IconRuler aria-hidden />
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
							<IconReplace aria-hidden />
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
								<IconArrowsMove aria-hidden />
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
								<IconX aria-hidden />
								{copy.workspace.closeView}
							</DropdownMenuItem>
						</ControlTooltip>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{view.kind === "source" ? (
				<PaneDisplayDialog
					paneId={paneId}
					view={view}
					open={displayOpen}
					onOpenChange={setDisplayOpen}
					finalFocus={() => triggerRef.current}
				/>
			) : null}
		</>
	);
}
