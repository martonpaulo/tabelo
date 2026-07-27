export type HistoryDirection = "undo" | "redo";

export interface LocalHistoryTarget {
	readonly undo: () => boolean;
	readonly redo: () => boolean;
	readonly canUndo: () => boolean;
	readonly canRedo: () => boolean;
}

const targets = new Map<string, LocalHistoryTarget>();
const listeners = new Set<() => void>();
let revision = 0;

function publish(): void {
	revision += 1;
	for (const listener of listeners) listener();
}

export function registerLocalHistory(
	paneId: string,
	target: LocalHistoryTarget,
): () => void {
	targets.set(paneId, target);
	publish();
	return () => {
		if (targets.get(paneId) !== target) return;
		targets.delete(paneId);
		publish();
	};
}

export function notifyLocalHistoryChanged(): void {
	publish();
}

export function subscribeHistory(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getHistoryRevision(): number {
	return revision;
}

export function canRunHistory(
	paneId: string,
	direction: HistoryDirection,
	canRunDocumentHistory: boolean,
): boolean {
	const target = targets.get(paneId);
	const canRunLocal =
		direction === "undo" ? target?.canUndo() : target?.canRedo();
	return Boolean(canRunLocal || canRunDocumentHistory);
}

export function runHistory(
	paneId: string,
	direction: HistoryDirection,
	runDocumentHistory: () => void,
): void {
	const target = targets.get(paneId);
	const handled = direction === "undo" ? target?.undo() : target?.redo();
	if (!handled) runDocumentHistory();
}
