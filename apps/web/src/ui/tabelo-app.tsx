import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isDocumentBlank } from "@/core/document";
import { runHistory } from "@/history/coordinator";
import { hasSessionWork, startAutosave, useTabeloStore } from "@/state/store";
import { AppMenu } from "@/ui/app-menu";
import { DownloadDialog } from "@/ui/download-dialog";
import { EmptyState } from "@/ui/grid/empty-state";
import { importTableFile } from "@/ui/import";
import { NewTableDialog } from "@/ui/new-table-dialog";
import { NoticeBar } from "@/ui/notice-bar";
import { usePwaUpdate } from "@/ui/pwa-update";
import { LayoutDialog } from "@/ui/workspace/layout-dialog";
import { Workspace } from "@/ui/workspace/workspace";
import { DEFAULT_PANE_ZOOM, stepPaneZoom } from "@/workspace/zoom";

type RootDialog = "download" | "layout" | "new-table" | null;

export function TabeloApp() {
	const pwaUpdate = usePwaUpdate();
	const [rootDialog, setRootDialog] = useState<RootDialog>(null);
	const dialogOpenerRef = useRef<HTMLElement | null>(null);
	const appMenuTriggerRef = useRef<HTMLButtonElement>(null);
	const [hydrated, setHydrated] = useState(false);
	const [welcomeOpen, setWelcomeOpen] = useState(false);
	const [addViewRequest, setAddViewRequest] = useState(0);
	const showWelcome = hydrated && welcomeOpen;

	const openRootDialog = (dialog: Exclude<RootDialog, null>) => {
		if (rootDialog !== null || document.querySelector('[role="dialog"]'))
			return;
		dialogOpenerRef.current = appMenuTriggerRef.current;
		setRootDialog(dialog);
	};

	const closeRootDialog = (open: boolean) => {
		if (open) return;
		const opener = dialogOpenerRef.current;
		dialogOpenerRef.current = null;
		setRootDialog(null);
		if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
	};

	const startNewTable = () => {
		// The app-menu trigger disappears behind the welcome surface, so a confirmed
		// dialog must not return focus to that now-inert opener as it closes.
		dialogOpenerRef.current = null;
		useTabeloStore.getState().resetDocument();
		setRootDialog(null);
		setWelcomeOpen(true);
	};

	const requestNewTable = () => {
		const state = useTabeloStore.getState();
		if (!hasSessionWork(state)) {
			startNewTable();
			return;
		}
		openRootDialog("new-table");
	};

	// Hydrate before the first paint so saved content never flashes the empty
	// welcome surface. The surface is shown only when hydration confirms that
	// there is no table content and no pending source draft.
	useLayoutEffect(() => {
		useTabeloStore.getState().hydrate();
		const state = useTabeloStore.getState();
		setWelcomeOpen(isDocumentBlank(state.document) && !hasSessionWork(state));
		const stopAutosave = startAutosave();
		setHydrated(true);
		return stopAutosave;
	}, []);

	// A trusted paste event carries the clipboard payload even when the browser
	// denies the async clipboard API. While the first-visit surface is open, it
	// should be enough to press the standard paste shortcut anywhere.
	useEffect(() => {
		if (!showWelcome) return;
		const onPaste = (event: ClipboardEvent) => {
			if (!event.clipboardData) return;
			const payload = {
				text: event.clipboardData.getData("text/plain"),
				html: event.clipboardData.getData("text/html"),
			};
			const before = useTabeloStore.getState().document;
			useTabeloStore.getState().pasteClipboard(payload);
			if (useTabeloStore.getState().document === before) return;
			event.preventDefault();
			setWelcomeOpen(false);
		};
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, [showWelcome]);

	// Undo and redo are document-level, so they work wherever focus is, except
	// inside a source editor, which owns the shortcut first and falls through to
	// these same actions once its own history is spent. See docs/adr/0003.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			const key = event.key.toLowerCase();
			const store = useTabeloStore.getState();
			const activePane = store.workspace.panes.find(
				(pane) => pane.id === store.workspace.activePaneId,
			);

			// Pane zoom follows the standard browser/editor shortcuts but changes
			// only the active view. It owns these keys even inside CodeMirror.
			if (activePane && (key === "+" || key === "=" || key === "-")) {
				event.preventDefault();
				store.setPaneZoom(
					activePane.id,
					stepPaneZoom(activePane.zoom, key === "-" ? -1 : 1),
				);
				return;
			}
			if (activePane && key === "0") {
				event.preventDefault();
				store.setPaneZoom(activePane.id, DEFAULT_PANE_ZOOM);
				return;
			}

			// Mod+S means "keep my work" everywhere else, so it opens the download
			// chooser here: Tabelo has nowhere to save to, and the browser's Save
			// Page would write the app shell rather than the table. Taken from
			// every focus, including inside a source editor, because the browser
			// would otherwise still act on it there.
			if (key === "s") {
				event.preventDefault();
				// A shortcut must not stack Download over an existing modal flow.
				if (rootDialog !== null || document.querySelector('[role="dialog"]')) {
					return;
				}
				dialogOpenerRef.current = document.activeElement as HTMLElement | null;
				setRootDialog("download");
				return;
			}

			const target = event.target as HTMLElement | null;
			if (target?.closest(".cm-editor")) return;
			if (key !== "z" && key !== "y") return;
			event.preventDefault();
			const direction = key === "y" || event.shiftKey ? "redo" : "undo";
			runHistory(store.workspace.activePaneId, direction, () =>
				direction === "redo" ? store.redo() : store.undo(),
			);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [rootDialog]);

	return (
		<div className="flex h-full min-h-0 flex-col bg-surface-app">
			<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
				<div
					className="flex min-h-0 min-w-0 flex-1"
					aria-hidden={showWelcome || undefined}
					inert={showWelcome || undefined}
				>
					<Workspace
						interactive={!showWelcome && rootDialog === null}
						addViewRequest={addViewRequest}
						addViewOpenerRef={appMenuTriggerRef}
					/>
				</div>
				{showWelcome ? (
					<EmptyState
						onStartEmpty={() => setWelcomeOpen(false)}
						onStarted={() => setWelcomeOpen(false)}
					/>
				) : null}
			</div>
			{showWelcome ? null : (
				<AppMenu
					onImport={() => void importTableFile()}
					onDownload={() => openRootDialog("download")}
					onLayout={() => openRootDialog("layout")}
					onAddView={() => setAddViewRequest((request) => request + 1)}
					onNewTable={requestNewTable}
					pwaUpdate={pwaUpdate}
					triggerRef={appMenuTriggerRef}
				/>
			)}
			<NoticeBar />
			<DownloadDialog
				open={rootDialog === "download"}
				onOpenChange={closeRootDialog}
			/>
			<LayoutDialog
				open={rootDialog === "layout"}
				onOpenChange={closeRootDialog}
			/>
			<NewTableDialog
				open={rootDialog === "new-table"}
				onOpenChange={closeRootDialog}
				onConfirm={startNewTable}
			/>
		</div>
	);
}
