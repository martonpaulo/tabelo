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
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { cn } from "@tabelo/ui/lib/utils";
import {
	Download,
	ExternalLink,
	FilePlus2,
	LayoutGrid,
	Redo2,
	RefreshCw,
	Undo2,
	Upload,
} from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import {
	canRunHistory,
	getHistoryRevision,
	runHistory,
	subscribeHistory,
} from "@/history/coordinator";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import { MenuOption } from "@/ui/primitives/menu-option";
import type { PwaUpdate } from "@/ui/pwa-update";
import {
	gridAreaOf,
	type LayoutId,
	type LayoutPreset,
	layoutPresets,
} from "@/workspace/layout";

function LayoutGlyph({
	preset,
	active,
}: {
	readonly preset: LayoutPreset;
	readonly active: boolean;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-6 shrink-0 grid-cols-2 grid-rows-2 gap-[0.0625rem] border p-[0.0625rem]",
				active ? "border-selection-edge" : "border-muted-foreground/50",
			)}
		>
			{preset.panes.map((slots) => {
				const area = gridAreaOf(slots);
				return (
					<span
						key={slots.join("")}
						className={active ? "bg-selection-edge" : "bg-muted-foreground/50"}
						style={{
							gridArea: `${area.rowStart} / ${area.columnStart} / ${area.rowEnd} / ${area.columnEnd}`,
						}}
					/>
				);
			})}
		</span>
	);
}

interface AppMenuProps {
	readonly onImport: () => void;
	readonly onDownload: () => void;
	readonly onNewTable: () => void;
	readonly pwaUpdate: PwaUpdate;
}

export function AppMenu({
	onImport,
	onDownload,
	onNewTable,
	pwaUpdate,
}: AppMenuProps) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const canUndoDocument = useTabeloStore((state) => state.past.length > 0);
	const canRedoDocument = useTabeloStore((state) => state.future.length > 0);
	const activePaneId = useTabeloStore((state) => state.workspace.activePaneId);
	const layout = useTabeloStore((state) => state.workspace.layout);
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
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={
					<Button
						ref={triggerRef}
						aria-label={
							pwaUpdate.ready
								? copy.actions.openAppMenuWithUpdate
								: copy.actions.openAppMenu
						}
						variant="outline"
						size="icon-lg"
						className="fixed right-3 bottom-3 z-40 size-fab border-line-strong bg-surface-panel shadow-lg"
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
					<DropdownMenuItem onClick={onNewTable}>
						<FilePlus2 aria-hidden />
						{copy.actions.newTable}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onImport}>
						<Upload aria-hidden />
						{copy.actions.importFile}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onDownload}>
						<Download aria-hidden />
						{copy.actions.downloadTable}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<LayoutGrid aria-hidden />
						{copy.workspace.layout}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent
						aria-label={copy.workspace.layout}
						className="w-auto min-w-64"
					>
						<DropdownMenuRadioGroup
							value={layout}
							onValueChange={(next) => {
								useTabeloStore.getState().setLayout(next as LayoutId);
								// The radio item lives in a submenu, so Base UI closes only
								// that level. Close the root after its event finishes, then
								// restore the command surface as the keyboard destination.
								queueMicrotask(() => {
									setOpen(false);
									requestAnimationFrame(() => triggerRef.current?.focus());
								});
							}}
						>
							<DropdownMenuLabel>{copy.workspace.layoutHint}</DropdownMenuLabel>
							{layoutPresets.map((preset) => (
								<DropdownMenuRadioItem
									key={preset.id}
									value={preset.id}
									closeOnClick
								>
									<LayoutGlyph preset={preset} active={preset.id === layout} />
									<MenuOption {...copy.layouts[preset.id]} />
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>

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
