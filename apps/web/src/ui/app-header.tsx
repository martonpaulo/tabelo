import { Redo2, Undo2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
	canRunHistory,
	getHistoryRevision,
	runHistory,
	subscribeHistory,
} from "@/history/coordinator";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { FileMenu } from "@/ui/file-menu";
import { ToolbarButton } from "@/ui/primitives/toolbar-button";
import { LayoutPicker } from "@/ui/workspace/layout-picker";

// Document-level actions only. Anything that acts on a row, a column, or one
// pane lives next to that thing instead — see docs/design-system.md §5.

export function AppHeader({
	onImport,
	onDownload,
}: {
	readonly onImport: () => void;
	readonly onDownload: () => void;
}) {
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

	return (
		<header className="flex h-panel-header shrink-0 items-center gap-1.5 border-line-strong border-b bg-surface-header px-3">
			<h1 className="shrink-0 font-semibold text-sm tracking-tight">
				{copy.app.name}
			</h1>
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
				onClick={() =>
					runHistory(activePaneId, "undo", () =>
						useTabeloStore.getState().undo(),
					)
				}
			/>
			<ToolbarButton
				icon={Redo2}
				label={copy.actions.redo}
				iconOnly
				shortcut={copy.shortcuts.redo}
				disabled={!canRedo}
				onClick={() =>
					runHistory(activePaneId, "redo", () =>
						useTabeloStore.getState().redo(),
					)
				}
			/>

			<FileMenu onImport={onImport} onDownload={onDownload} />
			<LayoutPicker
				value={layout}
				onChange={(next) => useTabeloStore.getState().setLayout(next)}
			/>
		</header>
	);
}
