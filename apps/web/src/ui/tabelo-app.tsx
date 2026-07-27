import { cn } from "@tabelo/ui/lib/utils";
import { useCallback, useEffect } from "react";
import { pickTextFile } from "@/platform/files";
import { startAutosave, useTabeloStore } from "@/state/store";
import { AppHeader } from "@/ui/app-header";
import { TablePanel } from "@/ui/grid/table-panel";
import { NoticeBar } from "@/ui/notice-bar";
import { SourcePanel } from "@/ui/source/source-panel";

export function TabeloApp() {
	const textPanelVisible = useTabeloStore((state) => state.textPanelVisible);

	useEffect(() => {
		useTabeloStore.getState().hydrate();
		return startAutosave();
	}, []);

	// Undo and redo are document-level, so they work wherever focus is — except
	// inside the source editor, which owns the shortcut first and falls through
	// to the same actions once its own history is spent. See docs/adr/0003.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest(".cm-editor")) return;
			if (event.key.toLowerCase() !== "z") return;
			event.preventDefault();
			if (event.shiftKey) useTabeloStore.getState().redo();
			else useTabeloStore.getState().undo();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const importFile = useCallback(async () => {
		const file = await pickTextFile(
			".csv,.tsv,.md,.markdown,.txt,text/csv,text/markdown",
		);
		if (!file) return;
		const format = /\.(md|markdown)$/i.test(file.name) ? "markdown" : "csv";
		useTabeloStore.getState().importText(file.text, format);
	}, []);

	return (
		<div className="flex h-full min-h-0 flex-col bg-surface-app">
			<AppHeader onImport={importFile} />
			<NoticeBar />

			{/* Stacked below 900px, side by side above it. The grid always comes
			    first in both DOM and visual order — it is the primary surface,
			    and it keeps the whole width when the source panel is hidden. */}
			<main
				className={cn(
					"grid min-h-0 flex-1 divide-line-strong",
					textPanelVisible
						? "grid-cols-1 grid-rows-2 divide-y min-[900px]:grid-cols-2 min-[900px]:grid-rows-1 min-[900px]:divide-x min-[900px]:divide-y-0"
						: "grid-cols-1 grid-rows-1",
				)}
			>
				<TablePanel onImport={importFile} />
				{textPanelVisible ? <SourcePanel /> : null}
			</main>
		</div>
	);
}
