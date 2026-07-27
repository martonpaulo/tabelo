import {
	FilePlus2,
	PanelRightClose,
	PanelRightOpen,
	Redo2,
	Undo2,
	Upload,
} from "lucide-react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { ToolbarButton, ToolbarDivider } from "@/ui/primitives/toolbar-button";
import { ThemeToggle } from "@/ui/theme-toggle";

// Document-level actions only. Anything that acts on a row or a column lives
// next to that row or column instead — see docs/design-system.md §5.

export function AppHeader({ onImport }: { readonly onImport: () => void }) {
	const canUndo = useTabeloStore((state) => state.past.length > 0);
	const canRedo = useTabeloStore((state) => state.future.length > 0);
	const textPanelVisible = useTabeloStore((state) => state.textPanelVisible);

	return (
		<header className="flex h-panel-header shrink-0 items-center gap-1.5 border-line-strong border-b bg-surface-header px-3">
			<span className="shrink-0 font-semibold text-sm tracking-tight">
				{copy.app.name}
			</span>
			<span className="hidden shrink-0 text-muted-foreground text-xs sm:inline">
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
			<ToolbarButton
				icon={FilePlus2}
				label={copy.actions.newTable}
				iconOnly
				onClick={() => useTabeloStore.getState().resetDocument()}
			/>
			<ToolbarButton
				icon={textPanelVisible ? PanelRightClose : PanelRightOpen}
				label={
					textPanelVisible ? copy.panels.hideSource : copy.panels.showSource
				}
				iconOnly
				onClick={() => useTabeloStore.getState().toggleTextPanel()}
			/>

			<ToolbarDivider />

			<ThemeToggle />
		</header>
	);
}
