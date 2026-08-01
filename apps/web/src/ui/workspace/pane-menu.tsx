import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	ChevronDown,
	ClipboardCopy,
	RotateCcw,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { copy } from "@/copy/copy";
import { canSerialize } from "@/formats";
import { useTabeloStore, visibleTextForPane } from "@/state/store";
import {
	copyFormattedTableToClipboard,
	copyToClipboard,
} from "@/ui/clipboard-actions";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import { MenuOption } from "@/ui/primitives/menu-option";
import { listViews } from "@/views/registry";
import type { ViewDefinition, ViewId } from "@/views/types";
import { smallerLayout } from "@/workspace/layout";
import {
	DEFAULT_PANE_ZOOM,
	MAX_PANE_ZOOM,
	MIN_PANE_ZOOM,
	paneZoomPercent,
	stepPaneZoom,
} from "@/workspace/zoom";

interface PaneIdentityProps {
	readonly paneId: string;
	readonly view: ViewDefinition;
	readonly compact: boolean;
}

// The view name is the control that changes the view. The heading stays as the
// wrapper rather than becoming the button itself: a button inside a heading is
// valid, a heading that is a button is not, and the pane has to keep
// contributing to the document outline. The Read only badge sits beside the
// trigger, outside it, because it reports state rather than doing anything.
export function PaneIdentity({ paneId, view, compact }: PaneIdentityProps) {
	const Icon = view.icon;
	const views = listViews();
	const openPanes = useTabeloStore((state) => state.workspace.panes);
	const document = useTabeloStore((state) => state.document);

	return (
		<h2 className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							// Says what it does and which view is current. A bare "Markdown"
							// would read as a label rather than as a control.
							aria-label={`${copy.workspace.changeView}: ${view.label}`}
							className="min-w-0 font-medium"
						/>
					}
				>
					<Icon aria-hidden className="shrink-0 text-muted-foreground" />
					<span className="truncate">
						{compact ? view.shortLabel : view.label}
					</span>
					<ChevronDown aria-hidden className="shrink-0 opacity-60" />
				</DropdownMenuTrigger>

				{/* The pane shows exactly one view, so the list is a radio group.
				    The checked value follows the store rather than the click, which
				    is what keeps a refused change: an invalid draft: from leaving
				    the menu claiming something the pane is not showing. */}
				<DropdownMenuContent align="start" className="w-auto min-w-64">
					<DropdownMenuRadioGroup
						value={view.id}
						onValueChange={(next) =>
							useTabeloStore.getState().setPaneView(paneId, next as ViewId)
						}
					>
						<DropdownMenuLabel>{copy.workspace.changeView}</DropdownMenuLabel>
						{views.map((candidate) => {
							const alreadyOpen = openPanes.some(
								(pane) => pane.id !== paneId && pane.view === candidate.id,
							);
							const failure =
								candidate.id !== view.id && candidate.codec
									? canSerialize(candidate.codec, document)
									: null;
							const disabledReason = alreadyOpen
								? copy.disabled.viewAlreadyOpen(candidate.label)
								: failure
									? copy.disabled.codecPrecondition(failure)
									: undefined;
							return (
								<DisabledTooltip key={candidate.id} reason={disabledReason}>
									<DropdownMenuRadioItem
										value={candidate.id}
										disabled={disabledReason !== undefined}
										closeOnClick
									>
										<candidate.icon aria-hidden />
										<MenuOption
											label={candidate.label}
											description={candidate.description}
										/>
									</DropdownMenuRadioItem>
								</DisabledTooltip>
							);
						})}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

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
}: Pick<PaneIdentityProps, "paneId" | "view">) {
	const zoom = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId)?.zoom ??
			DEFAULT_PANE_ZOOM,
	);
	const canClose = useTabeloStore(
		(state) => smallerLayout(state.workspace.layout) !== undefined,
	);
	const document = useTabeloStore((state) => state.document);
	const currentViewFailure = view.codec
		? canSerialize(view.codec, document)
		: null;

	const setZoom = (next: number) =>
		useTabeloStore.getState().setPaneZoom(paneId, next);

	return (
		<DropdownMenu>
			{/* A chevron and nothing else, matching the column affordance. With the
			    view name now carrying the pane's identity beside it, a second
			    labelled button repeated the word "Pane" on every pane at once. The
			    accessible name is the only signal left, so it names the view: with
			    four panes open, "Pane actions" alone would not say which. */}
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`${copy.workspace.paneActions}: ${view.label}`}
					/>
				}
			>
				<ChevronDown aria-hidden className="opacity-60" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-64">
				<DropdownMenuGroup>
					{/* The group's label carries the current value, so a screen reader
					    reports the percentage on entering the group and again after each
					    step: the items stay in place and the menu stays open. */}
					<DropdownMenuLabel aria-live="polite">
						{copy.workspace.zoom(paneZoomPercent(zoom))}
					</DropdownMenuLabel>
					<DisabledTooltip
						reason={
							zoom <= MIN_PANE_ZOOM ? copy.disabled.zoomMinimum : undefined
						}
					>
						<DropdownMenuItem
							aria-label={copy.workspace.zoomOut}
							closeOnClick={false}
							disabled={zoom <= MIN_PANE_ZOOM}
							onClick={() => setZoom(stepPaneZoom(zoom, -1))}
						>
							<ZoomOut aria-hidden />
							{copy.workspace.zoomOut}
							<DropdownMenuShortcut aria-hidden>
								{copy.shortcuts.zoomOut}
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					</DisabledTooltip>
					<DisabledTooltip
						reason={
							zoom === DEFAULT_PANE_ZOOM ? copy.disabled.zoomDefault : undefined
						}
					>
						<DropdownMenuItem
							aria-label={copy.workspace.resetZoom}
							closeOnClick={false}
							disabled={zoom === DEFAULT_PANE_ZOOM}
							onClick={() => setZoom(DEFAULT_PANE_ZOOM)}
						>
							<RotateCcw aria-hidden />
							{copy.workspace.resetZoom}
							<DropdownMenuShortcut aria-hidden>
								{copy.shortcuts.resetZoom}
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					</DisabledTooltip>
					<DisabledTooltip
						reason={
							zoom >= MAX_PANE_ZOOM ? copy.disabled.zoomMaximum : undefined
						}
					>
						<DropdownMenuItem
							aria-label={copy.workspace.zoomIn}
							closeOnClick={false}
							disabled={zoom >= MAX_PANE_ZOOM}
							onClick={() => setZoom(stepPaneZoom(zoom, 1))}
						>
							<ZoomIn aria-hidden />
							{copy.workspace.zoomIn}
							<DropdownMenuShortcut aria-hidden>
								{copy.shortcuts.zoomIn}
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					</DisabledTooltip>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				{/* Adding a view is not here. It belongs to the edge a pane would be
				    split along, because that edge is what decides where the new pane
				    lands, and a menu item cannot say which edge it means.
				    See docs/adr/0006. */}
				<DisabledTooltip
					reason={canClose ? undefined : copy.disabled.closeOnlyView}
				>
					<DropdownMenuItem
						disabled={!canClose}
						onClick={() => useTabeloStore.getState().closePane(paneId)}
					>
						<X aria-hidden />
						{copy.workspace.closeView}
					</DropdownMenuItem>
				</DisabledTooltip>

				{/* Whether a view can be copied from its pane menu is the registry's
				    answer. Source views offer text; the rendered preview offers a
				    structured table payload. The grid handles its own copying. */}
				{view.capabilities.textClipboard ||
				(view.capabilities.structuredClipboard &&
					!view.capabilities.tableOperations) ? (
					<>
						<DropdownMenuSeparator />
						<DisabledTooltip
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
										const visible = visibleTextForPane(state, paneId, view.id);
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
						</DisabledTooltip>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
