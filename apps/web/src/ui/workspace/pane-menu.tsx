import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	Check,
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
import { writeClipboardText } from "@/platform/files";
import { textForView, useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { listViews } from "@/views/registry";
import type { ViewDefinition } from "@/views/types";
import { largerLayout, smallerLayout } from "@/workspace/layout";
import {
	DEFAULT_PANE_ZOOM,
	MAX_PANE_ZOOM,
	MIN_PANE_ZOOM,
	paneZoomPercent,
	stepPaneZoom,
} from "@/workspace/zoom";

interface PaneControlProps {
	readonly paneId: string;
	readonly view: ViewDefinition;
	readonly compact: boolean;
}

export function PaneIdentity({
	view,
	compact,
}: Omit<PaneControlProps, "paneId">) {
	const Icon = view.icon;

	return (
		<h2 className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
			<Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
			<span className="truncate">{compact ? view.shortLabel : view.label}</span>
		</h2>
	);
}

export function PaneMenu({ paneId, view }: PaneControlProps) {
	const views = listViews();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const zoom = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId)?.zoom ??
			DEFAULT_PANE_ZOOM,
	);
	// Pane count changes move between presets, so what is possible here is
	// exactly what the layout gallery can express — see docs/adr/0006.
	const canAdd = useTabeloStore(
		(state) => largerLayout(state.workspace.layout) !== undefined,
	);
	const canClose = useTabeloStore(
		(state) => smallerLayout(state.workspace.layout) !== undefined,
	);

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
				<DropdownMenuGroup>
					<DropdownMenuLabel>{copy.workspace.changeView}</DropdownMenuLabel>
					{views.map((candidate) => (
						<DropdownMenuItem
							key={candidate.id}
							onClick={() =>
								useTabeloStore.getState().setPaneView(paneId, candidate.id)
							}
						>
							<candidate.icon aria-hidden />
							<span className="flex-1">
								<span className="block font-medium">{candidate.label}</span>
								<span className="block text-muted-foreground text-xs">
									{candidate.description}
								</span>
							</span>
							{candidate.id === view.id ? (
								<Check aria-hidden className="opacity-70" />
							) : null}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				<DropdownMenuGroup>
					{/* The group's label carries the current value, so a screen reader
					    reports the percentage on entering the group and again after each
					    step — the items stay in place and the menu stays open. */}
					<DropdownMenuLabel aria-live="polite">
						{copy.workspace.zoom(paneZoomPercent(zoom))}
					</DropdownMenuLabel>
					<DropdownMenuItem
						closeOnClick={false}
						disabled={zoom <= MIN_PANE_ZOOM}
						onClick={() => setZoom(stepPaneZoom(zoom, -1))}
					>
						<ZoomOut aria-hidden />
						{copy.workspace.zoomOut}
					</DropdownMenuItem>
					<DropdownMenuItem
						closeOnClick={false}
						disabled={zoom === DEFAULT_PANE_ZOOM}
						onClick={() => setZoom(DEFAULT_PANE_ZOOM)}
					>
						<RotateCcw aria-hidden />
						{copy.workspace.resetZoom}
					</DropdownMenuItem>
					<DropdownMenuItem
						closeOnClick={false}
						disabled={zoom >= MAX_PANE_ZOOM}
						onClick={() => setZoom(stepPaneZoom(zoom, 1))}
					>
						<ZoomIn aria-hidden />
						{copy.workspace.zoomIn}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				{/* Flat rather than a submenu of formats: the workspace grows, and the
				    new pane's own menu opens on its view list with focus already
				    there. See docs/design-system.md §5 on nested menus. */}
				<DropdownMenuItem
					disabled={!canAdd}
					onClick={() => useTabeloStore.getState().addPane()}
				>
					<Plus aria-hidden />
					{copy.workspace.addView}
				</DropdownMenuItem>

				<DropdownMenuItem
					disabled={!canClose}
					onClick={() => useTabeloStore.getState().closePane(paneId)}
				>
					<X aria-hidden />
					{copy.workspace.closeView}
				</DropdownMenuItem>

				{view.kind === "source" ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={async () => {
								const state = useTabeloStore.getState();
								const source =
									state.draft?.paneId === paneId &&
									state.draft.viewId === view.id
										? state.draft.text
										: textForView(state.document, view.id);
								if (await writeClipboardText(source)) {
									state.setNotice(copy.notices.sourceCopied);
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
