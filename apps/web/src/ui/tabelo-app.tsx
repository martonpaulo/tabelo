import { useEffect, useState } from "react";
import { isDocumentBlank } from "@/core/document";
import { runHistory } from "@/history/coordinator";
import { startAutosave, useTabeloStore } from "@/state/store";
import { AppMenu } from "@/ui/app-menu";
import { DownloadDialog } from "@/ui/download-dialog";
import { importTableFile } from "@/ui/import";
import { NewTableDialog } from "@/ui/new-table-dialog";
import { NoticeBar } from "@/ui/notice-bar";
import { usePwaUpdate } from "@/ui/pwa-update";
import { Workspace } from "@/ui/workspace/workspace";

export function TabeloApp() {
	const pwaUpdate = usePwaUpdate();
	const [downloading, setDownloading] = useState(false);
	const [confirmingNewTable, setConfirmingNewTable] = useState(false);

	const requestNewTable = () => {
		const state = useTabeloStore.getState();
		if (isDocumentBlank(state.document) && state.draft === null) {
			state.resetDocument();
			return;
		}
		setConfirmingNewTable(true);
	};

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
			const key = event.key.toLowerCase();

			// Mod+S means "keep my work" everywhere else, so it opens the download
			// chooser here — Tabelo has nowhere to save to, and the browser's Save
			// Page would write the app shell rather than the table. Taken from
			// every focus, including inside a source editor, because the browser
			// would otherwise still act on it there.
			if (key === "s") {
				event.preventDefault();
				setDownloading(true);
				return;
			}

			const target = event.target as HTMLElement | null;
			if (target?.closest(".cm-editor")) return;
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
			<NoticeBar pwaUpdate={pwaUpdate} />
			<Workspace />
			<AppMenu
				onImport={() => void importTableFile()}
				onDownload={() => setDownloading(true)}
				onNewTable={requestNewTable}
			/>
			<DownloadDialog open={downloading} onOpenChange={setDownloading} />
			<NewTableDialog
				open={confirmingNewTable}
				onOpenChange={setConfirmingNewTable}
				onConfirm={() => useTabeloStore.getState().resetDocument()}
			/>
		</div>
	);
}
