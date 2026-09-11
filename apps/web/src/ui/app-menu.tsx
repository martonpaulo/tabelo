import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { menuItemInsetStyles } from "@tabelo/ui/components/menu-styles";
import { cn } from "@tabelo/ui/lib/utils";
import {
	ClipboardCopy,
	Download,
	ExternalLink,
	FilePlus2,
	LayoutGrid,
	PanelRightOpen,
	Pencil,
	Redo2,
	RefreshCw,
	Settings2,
	Undo2,
	Upload,
} from "lucide-react";
import { Fragment, type RefObject, useSyncExternalStore } from "react";
import { copy } from "@/copy/copy";
import { product } from "@/copy/product";
import { canSerialize, listCodecs } from "@/formats";
import {
	canRunHistory,
	getHistoryRevision,
	runHistory,
	subscribeHistory,
} from "@/history/coordinator";
import { useTabeloStore } from "@/state/store";
import { copyCodecToClipboard } from "@/ui/clipboard-actions";
import { preconditionRecovery } from "@/ui/precondition-recovery";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { MenuOption } from "@/ui/primitives/menu-option";
import { RecoveryMenuItem } from "@/ui/primitives/recovery-command";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import type { PwaUpdate } from "@/ui/pwa-update";
import { useStackedWorkspace } from "@/ui/workspace/stacking";
import { getView } from "@/views/registry";
import {
	layoutsForPaneCount,
	paneCapacity,
	splitOptions,
} from "@/workspace/layout";

interface AppMenuProps {
	readonly onImport: () => void;
	readonly onDownload: () => void;
	readonly onLayout: () => void;
	readonly onSettings: () => void;
	readonly onAddView: () => void;
	readonly onNewTable: () => void;
	readonly onRename: () => void;
	readonly pwaUpdate: PwaUpdate;
	readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function AppMenu({
	onImport,
	onDownload,
	onLayout,
	onSettings,
	onAddView,
	onNewTable,
	onRename,
	pwaUpdate,
	triggerRef,
}: AppMenuProps) {
	const menuDialog = useMenuDialogCommand();
	const canUndoDocument = useTabeloStore((state) => state.past.length > 0);
	const tableName = useTabeloStore((state) => state.name);
	const canRedoDocument = useTabeloStore((state) => state.future.length > 0);
	const activePaneId = useTabeloStore((state) => state.workspace.activePaneId);
	const stacked = useStackedWorkspace();
	// Why Add view is refused, if it is: the presets tile no more panes, or the
	// window is too narrow for another one. The narrow cap only ever stops a
	// workspace from growing; see paneCapacity.
	const addViewRefusal = useTabeloStore((state) => {
		if (splitOptions(state.workspace, paneCapacity(stacked)).length > 0) {
			return undefined;
		}
		return splitOptions(state.workspace).length > 0
			? copy.disabled.addViewNarrow
			: copy.disabled.addViewMaximum;
	});
	// One pane and four panes each have a single arrangement, so there is nothing
	// for the dialog to offer. The command stays in place, disabled and explained,
	// rather than appearing and disappearing as the pane count changes.
	const canChangeLayout = useTabeloStore(
		(state) => layoutsForPaneCount(state.workspace.panes.length).length > 1,
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
						className="fixed right-3 bottom-3 z-40 size-fab hover:bg-surface-floating hover:shadow-lg"
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
						className="absolute top-1 right-1 size-2 rounded-full bg-selection-edge ring-2 ring-line-floating"
					/>
				) : null}
			</DropdownMenuTrigger>

			<DropdownMenuContent
				aria-label={copy.actions.openAppMenu}
				align="end"
				side="top"
				className="w-auto min-w-64 max-w-[calc(100vw-1.5rem)]"
			>
				{/* Static identity, outside every group: a menu group holds actions.
				    It takes the items' own inset so its text lines up with theirs.
				    Two contexts, split by the separator: what the product is and
				    who made it, then which document is open, sitting directly on
				    the action that renames it (#358). */}
				<div
					className={cn(
						"grid gap-2 whitespace-normal text-sm",
						menuItemInsetStyles,
					)}
				>
					<MenuOption label={copy.app.name} description={copy.app.tagline} />
					<span className="block text-muted-foreground text-xs">
						{copy.app.copyright}
					</span>
				</div>
				<DropdownMenuSeparator />
				<p
					data-slot="app-menu-table-name"
					className={cn("truncate text-sm", menuItemInsetStyles)}
				>
					{tableName}
				</p>
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onRename)}>
						<Pencil aria-hidden />
						{copy.actions.renameTable}
					</DropdownMenuItem>
				</DropdownMenuGroup>
				{pwaUpdate.ready ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<ControlTooltip
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
							</ControlTooltip>
						</DropdownMenuGroup>
					</>
				) : null}

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<ControlTooltip reason={canUndo ? undefined : copy.disabled.undo}>
						<DropdownMenuItem disabled={!canUndo} onClick={() => run("undo")}>
							<Undo2 aria-hidden />
							{copy.actions.undo}
							<DropdownMenuShortcut>{copy.shortcuts.undo}</DropdownMenuShortcut>
						</DropdownMenuItem>
					</ControlTooltip>
					<ControlTooltip reason={canRedo ? undefined : copy.disabled.redo}>
						<DropdownMenuItem disabled={!canRedo} onClick={() => run("redo")}>
							<Redo2 aria-hidden />
							{copy.actions.redo}
							<DropdownMenuShortcut>{copy.shortcuts.redo}</DropdownMenuShortcut>
						</DropdownMenuItem>
					</ControlTooltip>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						variant="destructive"
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
					<CopyAsSubmenu runAfterClose={menuDialog.runAfterClose} />
					<DropdownMenuItem
						onClick={() => menuDialog.runAfterClose(onDownload)}
					>
						<Download aria-hidden />
						{copy.actions.downloadTable}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<ControlTooltip reason={addViewRefusal}>
						<DropdownMenuItem
							disabled={addViewRefusal !== undefined}
							onClick={() => menuDialog.runAfterClose(onAddView)}
						>
							<PanelRightOpen aria-hidden />
							{copy.workspace.addView}
						</DropdownMenuItem>
					</ControlTooltip>
					<ControlTooltip
						reason={
							canChangeLayout ? undefined : copy.disabled.layoutOnlyArrangement
						}
					>
						<DropdownMenuItem
							disabled={!canChangeLayout}
							onClick={() => menuDialog.runAfterClose(onLayout)}
						>
							<LayoutGrid aria-hidden />
							{copy.workspace.layout}
						</DropdownMenuItem>
					</ControlTooltip>
					<DropdownMenuItem
						onClick={() => menuDialog.runAfterClose(onSettings)}
					>
						<Settings2 aria-hidden />
						{copy.settings.title}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						render={
							<a
								href={product.repositoryUrl}
								target="_blank"
								rel="noreferrer"
							/>
						}
					>
						<ExternalLink aria-hidden />
						{copy.actions.github}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// Copying the document as a format needs no pane showing that format, so this
// is a document-level command over codecs rather than over views. The list is
// the codec registry in its own order; nothing here names a format, so a codec
// added later gains a row without an edit. See docs/adr/0005.
//
// A submenu rather than a dialog because every row performs its command the
// moment it is chosen and needs nothing stated beforehand, which is the whole
// of the class docs/design-system.md §3 allows one for.
function CopyAsSubmenu({
	runAfterClose,
}: {
	readonly runAfterClose: (command: () => void) => void;
}) {
	const document = useTabeloStore((state) => state.document);

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<ClipboardCopy aria-hidden />
				{copy.actions.copyAs}
			</DropdownMenuSubTrigger>
			{/* No width of its own: the primitive already sizes a submenu to its
			    content above a shared floor, and the shared spacing rhythm comes
			    with it. */}
			<DropdownMenuSubContent aria-label={copy.actions.copyAs}>
				{listCodecs().map((codec) => {
					const view = getView(codec.id);
					const failure = canSerialize(codec, document);
					const recovery = preconditionRecovery(failure);
					const Icon = view.icon;

					return (
						// The refusal and its correction are the same pair the download
						// chooser and the pane menu already show, in the same words: the
						// row stays disabled and the correction stands beside it.
						<Fragment key={codec.id}>
							<ControlTooltip
								reason={
									failure ? copy.disabled.codecPrecondition(failure) : undefined
								}
							>
								<DropdownMenuItem
									disabled={failure !== null}
									onClick={() => void copyCodecToClipboard(codec, document)}
								>
									<Icon aria-hidden />
									{view.label}
								</DropdownMenuItem>
							</ControlTooltip>
							{recovery ? (
								<RecoveryMenuItem
									recovery={recovery}
									target={view.label}
									onRun={runAfterClose}
								/>
							) : null}
						</Fragment>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
