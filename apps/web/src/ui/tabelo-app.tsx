import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isDocumentBlank } from "@/core/document";
import { runHistory } from "@/history/coordinator";
import { hasSessionWork, startAutosave, useTabeloStore } from "@/state/store";
import { AppMenu } from "@/ui/app-menu";
import { DownloadDialog } from "@/ui/download-dialog";
import { EmptyState } from "@/ui/grid/empty-state";
import { HeaderRowDialog } from "@/ui/header-row-dialog";
import { importTableFile } from "@/ui/import";
import { NewTableDialog } from "@/ui/new-table-dialog";
import { NoticeBar } from "@/ui/notice-bar";
import { usePwaUpdate } from "@/ui/pwa-update";
import { SettingsDialog } from "@/ui/settings-dialog";
import { LayoutDialog } from "@/ui/workspace/layout-dialog";
import { Workspace } from "@/ui/workspace/workspace";
import { DEFAULT_PANE_ZOOM, stepPaneZoom } from "@/workspace/zoom";

type RootDialog = "download" | "layout" | "new-table" | "settings" | null;

// Which way the pane-zoom chord points: out, back to the default, or in.
// `code` is read first because Option rewrites the character on Apple keyboards,
// where Alt+`=` can arrive as `≠`; the physical key is what the user pressed, and
// it is also how browsers themselves bind their own zoom keys. The `key` values
// stay as a fallback for layouts and remappings that move those characters.
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
function paneZoomStep(event: KeyboardEvent): -1 | 0 | 1 | null {
	switch (event.code) {
		case "Minus":
		case "NumpadSubtract":
			return -1;
		case "Digit0":
		case "Numpad0":
			return 0;
		case "Equal":
		case "NumpadAdd":
			return 1;
	}
	switch (event.key) {
		case "-":
			return -1;
		case "0":
			return 0;
		case "+":
		case "=":
			return 1;
		default:
			return null;
	}
}

export function TabeloApp() {
	const pwaUpdate = usePwaUpdate();
	const [rootDialog, setRootDialog] = useState<RootDialog>(null);
	const dialogOpenerRef = useRef<HTMLElement | null>(null);
	const appMenuTriggerRef = useRef<HTMLButtonElement>(null);
	const [hydrated, setHydrated] = useState(false);
	const [welcomeOpen, setWelcomeOpen] = useState(false);
	const [addViewRequest, setAddViewRequest] = useState(0);
	const importQuestionOpen = useTabeloStore(
		(state) => state.pendingImport !== null,
	);
	const showWelcome = hydrated && welcomeOpen;
	const showWelcomeSurface = showWelcome && !importQuestionOpen;

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
		if (!showWelcomeSurface) return;
		const onPaste = (event: ClipboardEvent) => {
			if (!event.clipboardData) return;
			const payload = {
				text: event.clipboardData.getData("text/plain"),
				html: event.clipboardData.getData("text/html"),
			};
			const before = useTabeloStore.getState();
			before.pasteClipboard(payload);
			const after = useTabeloStore.getState();
			if (
				after.document === before.document &&
				after.pendingImport === before.pendingImport
			)
				return;
			event.preventDefault();
			if (after.document !== before.document) setWelcomeOpen(false);
		};
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, [showWelcomeSurface]);

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

			// Pane zoom adds Alt to the familiar zoom keys so that Mod+plus,
			// Mod+minus, and Mod+0 keep scaling the whole interface: that is the
			// affordance a user reaches for when the pane chrome, hit targets, and
			// focus rings are too small, and pane zoom deliberately leaves those
			// alone. The pane menu remains the discoverable path.
			if (event.altKey && activePane) {
				const step = paneZoomStep(event);
				if (step !== null) {
					event.preventDefault();
					store.setPaneZoom(
						activePane.id,
						step === 0
							? DEFAULT_PANE_ZOOM
							: stepPaneZoom(activePane.zoom, step),
					);
					return;
				}
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
				{showWelcomeSurface ? (
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
					onSettings={() => openRootDialog("settings")}
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
			<SettingsDialog
				open={rootDialog === "settings"}
				onOpenChange={closeRootDialog}
			/>
			<NewTableDialog
				open={rootDialog === "new-table"}
				onOpenChange={closeRootDialog}
				onConfirm={startNewTable}
			/>
			<HeaderRowDialog onImported={() => setWelcomeOpen(false)} />
		</div>
	);
}
