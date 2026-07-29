import type { ClipboardPayload } from "@/clipboard/parse";
import {
	type ClipboardBlock,
	readClipboardTable,
	writeClipboardTable,
	writeClipboardText,
} from "@/platform/clipboard";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// Every clipboard action the user can click goes through here, so the grid and
// the source panes never disagree about what a refusal looks like. Tabelo
// cannot grant itself clipboard permission; what it can do is say so and point
// at the keyboard, which is the path that still works.

// What is being copied. It selects both the confirmation and the recovery
// advice, because "select it and press the key" means something different in a
// table than in a text editor.
export type CopyScope = "selection" | "source";

export async function copyToClipboard(
	payload: ClipboardPayload,
	scope: CopyScope,
): Promise<boolean> {
	const outcome = payload.html
		? await writeClipboardTable(payload.text, payload.html)
		: await writeClipboardText(payload.text);

	const store = useTabeloStore.getState();
	store.setNotice(
		outcome.ok
			? copy.notices.copied(scope)
			: copy.notices.clipboardWriteFailed(scope),
	);
	return outcome.ok;
}

// Resolves to the payload only when there is something to act on, so callers
// stay a single line and never repeat the failure handling.
export async function readTableFromClipboard(): Promise<ClipboardPayload | null> {
	const outcome = await readClipboardTable();
	if (outcome.ok) return outcome.payload;

	useTabeloStore.getState().setNotice(clipboardReadMessage(outcome.reason));
	return null;
}

export async function pasteFromClipboard(): Promise<boolean> {
	const payload = await readTableFromClipboard();
	if (!payload) return false;
	const before = useTabeloStore.getState().document;
	useTabeloStore.getState().pasteClipboard(payload);
	return useTabeloStore.getState().document !== before;
}

function clipboardReadMessage(reason: ClipboardBlock): string {
	// An empty clipboard is not a failure to recover from: the user asked and
	// the answer is simply that there is nothing there.
	return reason === "empty"
		? copy.notices.clipboardEmpty
		: copy.notices.clipboardReadFailed;
}
