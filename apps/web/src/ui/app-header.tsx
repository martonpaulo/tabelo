import { FilePlus2, Redo2, Undo2, Upload } from "lucide-react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { DownloadMenu } from "@/ui/download-menu";
import { ToolbarButton, ToolbarDivider } from "@/ui/primitives/toolbar-button";
import { ThemeToggle } from "@/ui/theme-toggle";
import { LayoutPicker } from "@/ui/workspace/layout-picker";

// Document-level actions only. Anything that acts on a row, a column, or one
// pane lives next to that thing instead — see docs/design-system.md §5.

export function AppHeader({ onImport }: { readonly onImport: () => void }) {
	const canUndo = useTabeloStore((state) => state.past.length > 0);
	const canRedo = useTabeloStore((state) => state.future.length > 0);
	const layout = useTabeloStore((state) => state.workspace.layout);

	return (
		<header className="flex h-panel-header shrink-0 items-center gap-1.5 border-line-strong border-b bg-surface-header px-3">
			<span className="shrink-0 font-semibold text-sm tracking-tight">
				{copy.app.name}
			</span>
			<span className="hidden shrink-0 text-muted-foreground text-xs lg:inline">
				{copy.app.tagline}
			</span>

			<div aria-hidden className="flex-1" />

			<ToolbarButton
				icon={Undo2}
				label={copy.actions.undo}
				iconOnly
				shortcut={copy.shortcuts.undo}
				disabled={!canUndo}
				onClick={() => useTabeloStore.getState().undo()}
			/>
			<ToolbarButton
				icon={Redo2}
				label={copy.actions.redo}
				iconOnly
				shortcut={copy.shortcuts.redo}
				disabled={!canRedo}
				onClick={() => useTabeloStore.getState().redo()}
			/>

			<ToolbarDivider />

			<ToolbarButton
				icon={Upload}
				label={copy.actions.importFile}
				iconOnly
				onClick={onImport}
			/>
			<DownloadMenu />
			<ToolbarButton
				icon={FilePlus2}
				label={copy.actions.newTable}
				iconOnly
				onClick={() => useTabeloStore.getState().resetDocument()}
			/>

			<ToolbarDivider />

			<LayoutPicker
				value={layout}
				onChange={(next) => useTabeloStore.getState().setLayout(next)}
			/>
			<ThemeToggle />
		</header>
	);
}
