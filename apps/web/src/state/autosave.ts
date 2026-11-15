import type { StoreApi } from "zustand";
import { isDocumentBlank } from "@/core/document";
import { storageErased } from "@/persistence/erase";
import { LIBRARY_KEY, tableKey } from "@/persistence/schema";
import {
	type SaveOutcome,
	type SavePayload,
	saveTable,
	tableChangedElsewhere,
} from "@/persistence/storage";
import type { StorageIssue, TabeloState } from "./store";

// Autosave: when the active table is written, and when this tab must stop
// writing because storage no longer agrees with it. The store composes it and
// exposes it under its own names; this module owns the one pending save.

type TabeloStore = Pick<
	StoreApi<TabeloState>,
	"getState" | "setState" | "subscribe"
>;

export function storageBlocksWrites(issue: StorageIssue | null): boolean {
	return (
		issue?.kind === "unreadable" ||
		issue?.kind === "changed-elsewhere" ||
		(issue?.kind === "unavailable" && issue.readBlocked === true)
	);
}

export function savePayload(state: TabeloState): SavePayload {
	return {
		name: state.name,
		document: state.document,
		workspace: state.workspace,
		draft: state.draft
			? {
					paneId: state.draft.paneId,
					viewId: state.draft.viewId,
					text: state.draft.text,
				}
			: null,
	};
}

// Persisting on every keystroke would be wasteful, and persisting only on
// unload would lose work, so writes are debounced after changes settle.
const SAVE_DELAY_MS = 500;

// The one debounced save this tab has pending, if any. Module state rather
// than store state because it is a timer, not something any view renders.
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Drops the pending save without writing it. Also the reset a test calls, so
// a timer one test scheduled never fires into the next (#564).
export function cancelPendingSave(): void {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
}

export type FlushOutcome = SaveOutcome | { readonly status: "blocked" };

export function flushStore(store: TabeloStore): FlushOutcome {
	// Nothing is written after the user erased everything: the reload that
	// follows would otherwise carry the table back into storage.
	if (storageErased()) return { status: "blocked" };
	const current = store.getState();
	if (storageBlocksWrites(current.storageIssue)) {
		return { status: "blocked" };
	}
	// With no table active there is nothing to write until content arrives,
	// and content that does arrive gets its own table first (#466).
	if (current.library.activeId === null) {
		if (isDocumentBlank(current.document) && current.draft === null)
			return { status: "saved" };
		const created = current.ensureActiveTable();
		return created.status === "saved" ? created : { status: "blocked" };
	}
	// The storage event normally says so first; this catches a write it has
	// not delivered yet, so a stale tab never writes over a newer table (#543).
	if (tableChangedElsewhere(current.library.activeId)) {
		markChangedElsewhere(store);
		return { status: "blocked" };
	}
	const outcome = saveTable(current.library.activeId, savePayload(current));
	store.setState({
		storageIssue: outcome.status === "saved" ? null : { kind: outcome.status },
	});
	return outcome;
}

// Another tab wrote what this tab would write next. Every write stops through
// `storageBlocksWrites` until the user reloads, and the pending save goes with
// it, so neither tab's stored edit is overwritten by a copy older than it.
function markChangedElsewhere(store: TabeloStore): void {
	cancelPendingSave();
	store.setState({ storageIssue: { kind: "changed-elsewhere" } });
}

// The browser fires `storage` in every other tab of this origin when one
// writes, never in the writer itself. A null key is a `clear()`.
function isSharedKeyForThisTab(
	store: TabeloStore,
	key: string | null,
): boolean {
	if (key === null || key === LIBRARY_KEY) return true;
	const { activeId } = store.getState().library;
	return activeId !== null && key === tableKey(activeId);
}

export function startStoreAutosave(store: TabeloStore): () => void {
	const onStorage = (event: StorageEvent) => {
		if (isSharedKeyForThisTab(store, event.key)) markChangedElsewhere(store);
	};
	const flush = () => {
		cancelPendingSave();
		flushStore(store);
	};
	const unsubscribe = store.subscribe((state, previous) => {
		if (
			state.name === previous.name &&
			state.document === previous.document &&
			state.workspace === previous.workspace &&
			state.draft === previous.draft
		)
			return;

		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = null;
			flushStore(store);
		}, SAVE_DELAY_MS);
	});
	const onVisibilityChange = () => {
		if (document.visibilityState === "hidden") flush();
	};
	window.addEventListener("pagehide", flush);
	window.addEventListener("storage", onStorage);
	document.addEventListener("visibilitychange", onVisibilityChange);
	return () => {
		unsubscribe();
		window.removeEventListener("pagehide", flush);
		window.removeEventListener("storage", onStorage);
		document.removeEventListener("visibilitychange", onVisibilityChange);
		cancelPendingSave();
	};
}
