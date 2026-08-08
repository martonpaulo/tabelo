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
	ChevronDown,
	ClipboardCopy,
	Move as MoveIcon,
	Replace,
	RotateCcw,
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
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
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
}: {
	readonly paneId: string;
	readonly view: ViewDefinition;
	readonly onChangeView: (opener: HTMLButtonElement | null) => void;
	readonly onMovePane: (opener: HTMLButtonElement | null) => void;
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
	const document = useTabeloStore((state) => state.document);
	const currentViewFailure = view.codec
		? canSerialize(view.codec, document)
		: null;
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
			<DropdownMenuTrigger
				render={
					<Button
						ref={triggerRef}
						variant="ghost"
						size="icon-sm"
						aria-label={`${copy.workspace.paneActions}: ${view.label}`}
					/>
				}
			>
				<ChevronDown aria-hidden className="opacity-60" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-64">
				{/* Copy leads when this view exposes a clipboard capability. The
				    registry decides both availability and payload; the menu only
				    places the command in the content group. */}
				{canCopy ? (
					<>
						<DropdownMenuGroup>
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
							</DisabledTooltip>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
					</>
				) : null}

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

					{view.kind === "source" ? (
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
					) : null}
				</DropdownMenuGroup>

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
					<DisabledTooltip
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
					</DisabledTooltip>

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
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
