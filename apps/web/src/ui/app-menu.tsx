import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	Download,
	ExternalLink,
	FilePlus2,
	LayoutGrid,
	PanelRightOpen,
	Redo2,
	RefreshCw,
	Undo2,
	Upload,
} from "lucide-react";
import { type RefObject, useSyncExternalStore } from "react";
import { copy } from "@/copy/copy";
import {
	canRunHistory,
	getHistoryRevision,
	runHistory,
	subscribeHistory,
} from "@/history/coordinator";
import { useTabeloStore } from "@/state/store";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import { MenuOption } from "@/ui/primitives/menu-option";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import type { PwaUpdate } from "@/ui/pwa-update";
import { splitOptions } from "@/workspace/layout";

interface AppMenuProps {
	readonly onImport: () => void;
	readonly onDownload: () => void;
	readonly onLayout: () => void;
	readonly onAddView: () => void;
	readonly onNewTable: () => void;
	readonly pwaUpdate: PwaUpdate;
	readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function AppMenu({
	onImport,
	onDownload,
	onLayout,
	onAddView,
	onNewTable,
	pwaUpdate,
	triggerRef,
}: AppMenuProps) {
	const menuDialog = useMenuDialogCommand();
	const canUndoDocument = useTabeloStore((state) => state.past.length > 0);
	const canRedoDocument = useTabeloStore((state) => state.future.length > 0);
	const activePaneId = useTabeloStore((state) => state.workspace.activePaneId);
	const canAddView = useTabeloStore(
		(state) => splitOptions(state.workspace).length > 0,
	);
	useSyncExternalStore(
		subscribeHistory,
		getHistoryRevision,
		getHistoryRevision,
	);
	const canUndo = canRunHistory(activePaneId, "undo", canUndoDocument);
	const canRedo = canRunHistory(activePaneId, "redo", canRedoDocument);

	const run = (direction: "undo" | "redo") =>
		runHistory(activePaneId, direction, () => {
			const state = useTabeloStore.getState();
			if (direction === "undo") state.undo();
			else state.redo();
		});
	return (
		<DropdownMenu
			open={menuDialog.open}
			onOpenChange={menuDialog.onOpenChange}
			onOpenChangeComplete={menuDialog.onOpenChangeComplete}
		>
			<DropdownMenuTrigger
				render={
					<Button
						ref={triggerRef}
						aria-label={
							pwaUpdate.ready
								? copy.actions.openAppMenuWithUpdate
								: copy.actions.openAppMenu
						}
						variant="ghost"
						size="icon-lg"
						// Resting flush with the workspace behind it, so it reads as part
						// of the canvas rather than a panel sitting on top; the surface
						// and shadow that make it read as a floating control only appear
						// once a pointer actually reaches it. Ghost rather than outline
						// because outline carries a resting border and fill of its own in
						// dark mode, which no transparent override on this element can
						// win against.
						className="fixed right-3 bottom-3 z-40 size-fab hover:bg-surface-floating hover:shadow-lg dark:hover:bg-surface-floating"
					/>
				}
			>
				<img
					aria-hidden
					alt=""
					src={`${import.meta.env.BASE_URL}logo.svg`}
					className="size-7"
				/>
				{pwaUpdate.ready ? (
					<span
						aria-hidden
						className="absolute top-1 right-1 size-2 rounded-full bg-selection-edge ring-2 ring-surface-panel"
					/>
				) : null}
			</DropdownMenuTrigger>

			<DropdownMenuContent
				aria-label={copy.actions.openAppMenu}
				align="end"
				side="top"
				className="w-auto min-w-64 max-w-[calc(100vw-1.5rem)]"
			>
				<DropdownMenuGroup>
					<div className="max-w-72 whitespace-normal px-2 py-1.5 text-sm">
						<MenuOption label={copy.app.name} description={copy.app.tagline} />
					</div>
				</DropdownMenuGroup>
				{pwaUpdate.ready ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DisabledTooltip
								reason={
									pwaUpdate.updating
										? copy.disabled.updateInProgress
										: undefined
								}
							>
								<DropdownMenuItem
									disabled={pwaUpdate.updating}
									onClick={pwaUpdate.apply}
								>
									<RefreshCw aria-hidden />
									<MenuOption {...copy.appUpdate} />
								</DropdownMenuItem>
							</DisabledTooltip>
						</DropdownMenuGroup>
					</>
				) : null}

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DisabledTooltip reason={canUndo ? undefined : copy.disabled.undo}>
						<DropdownMenuItem disabled={!canUndo} onClick={() => run("undo")}>
							<Undo2 aria-hidden />
							{copy.actions.undo}
							<DropdownMenuShortcut>{copy.shortcuts.undo}</DropdownMenuShortcut>
						</DropdownMenuItem>
					</DisabledTooltip>
					<DisabledTooltip reason={canRedo ? undefined : copy.disabled.redo}>
						<DropdownMenuItem disabled={!canRedo} onClick={() => run("redo")}>
							<Redo2 aria-hidden />
							{copy.actions.redo}
							<DropdownMenuShortcut>{copy.shortcuts.redo}</DropdownMenuShortcut>
						</DropdownMenuItem>
					</DisabledTooltip>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={() => menuDialog.runAfterClose(onNewTable)}
					>
						<FilePlus2 aria-hidden />
						{copy.actions.newTable}
					</DropdownMenuItem>
					{/* Import runs on the click itself, not after the menu's close
					    animation. The file picker is the browser's own layer, so it
					    never stacks over the menu, and asking for it needs the user
					    activation that this click carries: deferred behind a
					    transition, a slow frame can let that activation lapse and the
					    browser then drops the request without a word. Every other
					    command here opens an in-app dialog and still waits. */}
					<DropdownMenuItem onClick={onImport}>
						<Upload aria-hidden />
						{copy.actions.importFile}
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => menuDialog.runAfterClose(onDownload)}
					>
						<Download aria-hidden />
						{copy.actions.downloadTable}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DisabledTooltip
						reason={canAddView ? undefined : copy.disabled.addViewMaximum}
					>
						<DropdownMenuItem
							disabled={!canAddView}
							onClick={() => menuDialog.runAfterClose(onAddView)}
						>
							<PanelRightOpen aria-hidden />
							{copy.workspace.addView}
						</DropdownMenuItem>
					</DisabledTooltip>
					<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onLayout)}>
						<LayoutGrid aria-hidden />
						{copy.workspace.layout}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuItem
					render={
						<a
							href="https://github.com/martonpaulo/tabelo"
							target="_blank"
							rel="noreferrer"
						/>
					}
				>
					<ExternalLink aria-hidden />
					{copy.actions.github}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
