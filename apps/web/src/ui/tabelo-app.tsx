import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { copy } from "@/copy/copy";
import { product, tableDocumentTitle } from "@/copy/product";
import { isDocumentBlank } from "@/core/document";
import { runHistory } from "@/history/coordinator";
import { usePwaUpdate } from "@/pwa/use-pwa-update";
import { hasSessionWork, startAutosave, useTabeloStore } from "@/state/store";
import { AppMenu } from "@/ui/app-menu";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { DownloadDialog } from "@/ui/download-dialog";
import { EmptyState } from "@/ui/grid/empty-state";
import { HeaderRowDialog } from "@/ui/header-row-dialog";
import { importTableFile } from "@/ui/import-actions";
import { NoticeBar } from "@/ui/notice-bar";
import { RenameTableDialog } from "@/ui/rename-table-dialog";
import { SettingsDialog } from "@/ui/settings-dialog";
import { LayoutDialog } from "@/ui/workspace/layout-dialog";
import { preloadPaneContent } from "@/ui/workspace/pane-content";
import { Workspace } from "@/ui/workspace/workspace";
import { getView, listViews } from "@/views/registry";
import { DEFAULT_PANE_ZOOM, stepPaneZoom } from "@/workspace/zoom";

type RootDialog =
	| "download"
	| "copy-table"
	| "layout"
	| "delete-table"
	| "rename-table"
	| "settings"
	| null;

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

// The welcome surface owns focus and disappears with the import that replaced
// it, so focus is placed rather than dropped to the document. It lands on the
// pane frame the workspace made active, which is where a pane the workspace
// itself created also puts it: the frame is a labelled region that says which
// pane arrived, and entering its content stays a deliberate keystroke.
// See docs/design-system/9-accessibility.md and 3-components.md.
function focusActivePane(): void {
	requestAnimationFrame(() => {
		const { activePaneId } = useTabeloStore.getState().workspace;
		document
			.querySelector<HTMLElement>(`[data-pane-id="${activePaneId}"]`)
			?.focus();
	});
}

// The welcome surface opens only when hydration found no table content and no
// pending source draft.
function opensOnWelcome(): boolean {
	const state = useTabeloStore.getState();
	return isDocumentBlank(state.document) && !hasSessionWork(state);
}

// Restores the saved session and loads the code of the views it shows, before
// the first render. Hydrating first makes the first render the saved
// workspace, so saved content never flashes the welcome surface and nothing
// renders twice. Loading the shown views first lets their panes paint with the
// rest of the workspace instead of behind a loading state. A session that opens
// on the welcome surface waits for nothing, since the surface covers the panes.
export function prepareTabeloApp(): Promise<void> {
	useTabeloStore.getState().hydrate();
	if (opensOnWelcome()) return Promise.resolve();
	return preloadPaneContent(
		useTabeloStore.getState().workspace.panes.map((pane) => getView(pane.view)),
	);
}

export function TabeloApp() {
	const pwaUpdate = usePwaUpdate();
	const [rootDialog, setRootDialog] = useState<RootDialog>(null);
	const [tableToDelete, setTableToDelete] = useState<string | null>(null);
	// Which table the copy or download chooser is about: any table can be
	// written out, and writing one out never opens it.
	const [tableToWrite, setTableToWrite] = useState<string | null>(null);
	const [newTableRetreat, setNewTableRetreat] = useState<{
		readonly created: string;
		readonly previous: string;
	} | null>(null);
	const [tableToRename, setTableToRename] = useState<string | null>(null);
	const dialogOpenerRef = useRef<HTMLElement | null>(null);
	const appMenuTriggerRef = useRef<HTMLButtonElement>(null);
	const [welcomeOpen, setWelcomeOpen] = useState(opensOnWelcome);
	const [addViewRequest, setAddViewRequest] = useState(0);
	const tableName = useTabeloStore((state) => state.name);
	const importQuestionOpen = useTabeloStore(
		(state) => state.pendingImport !== null,
	);
	const showWelcome = welcomeOpen;
	// The welcome card stays up while a paste or an import asks whether row 1
	// is the header, so the question sits over the card rather than over an
	// empty table that is about to be replaced (owner, 2026-09-19). It only
	// stops taking input until the question is answered: an answer closes the
	// welcome surface with the imported table, and a cancel leaves the card
	// where it was.
	const acceptsWelcomeInput = showWelcome && !importQuestionOpen;

	// Every way content can arrive while the welcome surface is open ends here:
	// the surface goes, and focus follows the content into the workspace.
	const finishWelcomeImport = useCallback(() => {
		setWelcomeOpen(false);
		focusActivePane();
	}, []);

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

	// A new table is added beside the others rather than replacing one, so
	// nothing is lost and nothing is asked (#403). The welcome surface opens on
	// it the way it does on an empty table.
	const startNewTable = () => {
		dialogOpenerRef.current = null;
		const before = useTabeloStore.getState().library.activeId;
		useTabeloStore.getState().createTable();
		// What "go back" undoes, for as long as this welcome surface is the one
		// the new table opened on.
		setNewTableRetreat({
			created: useTabeloStore.getState().library.activeId,
			previous: before,
		});
		setRootDialog(null);
		setWelcomeOpen(true);
	};

	// Leaves the table that was just created, deletes it, and returns to the
	// one the user came from. Only ever offered on a table with nothing in it,
	// so nothing can be lost by taking it.
	const cancelNewTable = () => {
		if (!newTableRetreat) return;
		const store = useTabeloStore.getState();
		store.switchTable(newTableRetreat.previous);
		store.deleteTable(newTableRetreat.created);
		setNewTableRetreat(null);
		setWelcomeOpen(false);
		// The reader came from the menu and is still choosing, so the menu is
		// where they are put back (owner, 2026-09-20).
		requestAnimationFrame(() => appMenuTriggerRef.current?.click());
	};

	// Which table the delete dialog is about: the menu asks for one by id, so
	// deleting the table under the pointer never depends on it being active.
	const deleteTable = () => {
		if (tableToDelete) useTabeloStore.getState().deleteTable(tableToDelete);
		setTableToDelete(null);
		setRootDialog(null);
	};

	useLayoutEffect(() => startAutosave(), []);

	// Once the workspace is on screen, the code of every other lazy view loads
	// too, so a pane switched to one later renders at once rather than behind a
	// loading state. After the first paint, so it never delays that paint.
	useEffect(() => {
		void preloadPaneContent(listViews());
	}, []);

	useEffect(() => {
		document.title = tableDocumentTitle(tableName);
	}, [tableName]);

	// A trusted paste event carries the clipboard payload even when the browser
	// denies the async clipboard API. While the first-visit surface is open, it
	// should be enough to press the standard paste shortcut anywhere.
	useEffect(() => {
		if (!acceptsWelcomeInput) return;
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
			if (after.document !== before.document) finishWelcomeImport();
		};
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, [finishWelcomeImport, acceptsWelcomeInput]);

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
			// would otherwise still act on it there. A chord the focused surface
			// already claimed is left to it: the grid's Mod+Shift+S strikes text
			// through (#306).
			if (key === "s" && !event.defaultPrevented) {
				event.preventDefault();
				// A shortcut must not stack Download over an existing modal flow.
				if (rootDialog !== null || document.querySelector('[role="dialog"]')) {
					return;
				}
				dialogOpenerRef.current = document.activeElement as HTMLElement | null;
				setRootDialog("download");
				return;
			}

			// Import left the menu (owner, 2026-09-20), so the chord is the way
			// in once a table exists; the welcome surface keeps its own button.
			// It runs on the keystroke itself, because the file picker needs the
			// user activation this event carries.
			if (key === "o" && !event.defaultPrevented) {
				event.preventDefault();
				if (rootDialog !== null || document.querySelector('[role="dialog"]')) {
					return;
				}
				void importTableFile();
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
			{/* The interface is a workspace of panes, so no visible text acts as the
			    page heading. Assistive technology and search engines still expect
			    one, and it names the product rather than the open table, which the
			    document title already carries. */}
			<h1 className="sr-only">{`${product.name}: ${product.tagline}`}</h1>
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
						suspended={importQuestionOpen}
						onStartEmpty={() => {
							setNewTableRetreat(null);
							setWelcomeOpen(false);
						}}
						onCancel={newTableRetreat ? cancelNewTable : undefined}
						onStarted={finishWelcomeImport}
					/>
				) : null}
			</div>
			{showWelcome ? null : (
				<AppMenu
					onDownload={(tableId) => {
						setTableToWrite(tableId);
						openRootDialog("download");
					}}
					onLayout={() => openRootDialog("layout")}
					onSettings={() => openRootDialog("settings")}
					onAddView={() => setAddViewRequest((request) => request + 1)}
					onCopy={(tableId) => {
						setTableToWrite(tableId);
						openRootDialog("copy-table");
					}}
					onNewTable={startNewTable}
					onDeleteTable={(tableId) => {
						setTableToDelete(tableId);
						openRootDialog("delete-table");
					}}
					onRename={(tableId) => {
						setTableToRename(tableId);
						openRootDialog("rename-table");
					}}
					pwaUpdate={pwaUpdate}
					triggerRef={appMenuTriggerRef}
				/>
			)}
			<NoticeBar />
			<DownloadDialog
				open={rootDialog === "download"}
				tableId={tableToWrite ?? undefined}
				onOpenChange={closeRootDialog}
			/>
			<DownloadDialog
				destination="clipboard"
				open={rootDialog === "copy-table"}
				tableId={tableToWrite ?? undefined}
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
			<RenameTableDialog
				open={rootDialog === "rename-table"}
				// Kept past the close: the dialog holds its content through the
				// closing transition, and clearing the target now would make the
				// field flip to another table's name on its way out.
				tableId={tableToRename}
				onOpenChange={closeRootDialog}
			/>
			<ConfirmDialog
				open={rootDialog === "delete-table"}
				onOpenChange={closeRootDialog}
				onConfirm={deleteTable}
				title={copy.deleteTable.title}
				description={copy.deleteTable.description}
				confirmLabel={copy.deleteTable.confirm}
			/>
			<HeaderRowDialog onImported={finishWelcomeImport} />
		</div>
	);
}
