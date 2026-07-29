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
	MoreHorizontal,
	Plus,
	RotateCcw,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { canSerialize } from "@/formats";
import { useTabeloStore, visibleTextForPane } from "@/state/store";
import { copyToClipboard } from "@/ui/clipboard-actions";
import { copy } from "@/ui/copy";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import { MenuOption } from "@/ui/primitives/menu-option";
import { listViews } from "@/views/registry";
import type { ViewDefinition, ViewId } from "@/views/types";
import { largerLayout, smallerLayout } from "@/workspace/layout";
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

export function PaneIdentity({
	view,
	compact,
}: Omit<PaneIdentityProps, "paneId">) {
	const Icon = view.icon;

	return (
		<h2 className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
			<Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
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
}: Pick<PaneIdentityProps, "paneId" | "view">) {
	const views = listViews();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const zoom = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId)?.zoom ??
			DEFAULT_PANE_ZOOM,
	);
	// Pane count changes move between presets, so what is possible here is
	// exactly what the layout gallery can express: see docs/adr/0006.
	const canAdd = useTabeloStore(
		(state) => largerLayout(state.workspace.layout) !== undefined,
	);
	const canClose = useTabeloStore(
		(state) => smallerLayout(state.workspace.layout) !== undefined,
	);
	const openPanes = useTabeloStore((state) => state.workspace.panes);
	const document = useTabeloStore((state) => state.document);

	// A pane the user just added hands its menu the focus, so the view it should
	// show is one keystroke away rather than something to go looking for.
	const wantsFocus = useTabeloStore((state) => state.paneMenuFocus === paneId);
	useEffect(() => {
		if (!wantsFocus) return;
		triggerRef.current?.focus();
		useTabeloStore.getState().clearPaneMenuFocus();
	}, [wantsFocus]);

	const setZoom = (next: number) =>
		useTabeloStore.getState().setPaneZoom(paneId, next);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						ref={triggerRef}
						variant="ghost"
						size="sm"
						aria-label={`${copy.workspace.paneActions}: ${view.label}`}
					/>
				}
			>
				<MoreHorizontal aria-hidden />
				<span className="font-medium">{copy.workspace.pane}</span>
				<ChevronDown aria-hidden className="opacity-60" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-64">
				{/* The pane shows exactly one view, so the list is a radio group.
				    The checked value follows the store rather than the click, which
				    is what keeps a refused change: an invalid draft: from leaving
				    the menu claiming something the pane is not showing. */}
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
						const failure = candidate.codec
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

				<DropdownMenuSeparator />

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

				{/* Flat rather than a submenu of formats: the workspace grows, and the
				    new pane's own menu opens on its view list with focus already
				    there. See docs/design-system.md §5 on nested menus. */}
				<DisabledTooltip
					reason={canAdd ? undefined : copy.disabled.addViewLimit}
				>
					<DropdownMenuItem
						disabled={!canAdd}
						onClick={() => useTabeloStore.getState().addPane()}
					>
						<Plus aria-hidden />
						{copy.workspace.addView}
					</DropdownMenuItem>
				</DisabledTooltip>

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

				{/* Whether a view's text can be copied is the registry's answer, not
				    this component's. A read-only source view offers it. The rendered
				    preview has no source to hand over, so it does not. */}
				{view.capabilities.textClipboard ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => {
								const state = useTabeloStore.getState();
								const visible = visibleTextForPane(state, paneId, view.id);
								if (visible.ok) {
									void copyToClipboard({ text: visible.text }, "source");
								}
							}}
						>
							<ClipboardCopy aria-hidden />
							{copy.actions.copySource}
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
