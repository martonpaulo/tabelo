import { useEffect } from "react";
import { runHistory } from "@/history/coordinator";
import { startAutosave, useTabeloStore } from "@/state/store";
import { AppHeader } from "@/ui/app-header";
import { importTableFile } from "@/ui/import";
import { NoticeBar } from "@/ui/notice-bar";
import { usePwaUpdate } from "@/ui/pwa-update";
import { Workspace } from "@/ui/workspace/workspace";

export function TabeloApp() {
	const pwaUpdate = usePwaUpdate();

	useEffect(() => {
		useTabeloStore.getState().hydrate();
		return startAutosave();
	}, []);

	// Undo and redo are document-level, so they work wherever focus is — except
	// inside a source editor, which owns the shortcut first and falls through to
	// these same actions once its own history is spent. See docs/adr/0003.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest(".cm-editor")) return;
			const key = event.key.toLowerCase();
			if (key !== "z" && key !== "y") return;
			event.preventDefault();
			const store = useTabeloStore.getState();
			const direction = key === "y" || event.shiftKey ? "redo" : "undo";
			runHistory(store.workspace.activePaneId, direction, () =>
				direction === "redo" ? store.redo() : store.undo(),
			);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<div className="flex h-full min-h-0 flex-col bg-surface-app">
			<AppHeader onImport={() => void importTableFile()} />
			<NoticeBar pwaUpdate={pwaUpdate} />
			<Workspace />
		</div>
	);
}
