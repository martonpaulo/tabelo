import type { ClipboardPayload } from "@/clipboard/parse";
import { matrixToTsv } from "@/clipboard/serialize";
import { copy } from "@/copy/copy";
import { documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { htmlCodec } from "@/formats";
import {
	type ClipboardBlock,
	readClipboardTable,
	writeClipboardTable,
	writeClipboardText,
} from "@/platform/clipboard";
import type { NoticeRequest } from "@/state/notice-queue";
import { useTabeloStore } from "@/state/store";

// Every clipboard action the user can click goes through here, so the grid and
// the source panes never disagree about what a refusal looks like. Tabelo
// cannot grant itself clipboard permission; what it can do is say so and point
// at the keyboard, which is the path that still works.

// What is being copied. It selects both the confirmation and the recovery
// advice, because "select it and press the key" means something different in a
// table than in a text editor.
export type CopyScope = "selection" | "source" | "preview";

export async function copyFormattedTableToClipboard(
	document: TableDocument,
): Promise<boolean> {
	const html = htmlCodec.serialize(document);
	const text = matrixToTsv(documentToMatrix(document));
	return copyToClipboard({ text, html }, "preview");
}

export async function copyToClipboard(
	payload: ClipboardPayload,
	scope: CopyScope,
): Promise<boolean> {
	const outcome = payload.html
		? await writeClipboardTable(payload.text, payload.html)
		: await writeClipboardText(payload.text);

	// A refusal is a failure and says so, in its own tone and without a timer.
	// It used to arrive as an informational message in the lowest-ranked slot,
	// which is how the recovery advice went unread.
	useTabeloStore.getState().pushNotice(
		outcome.ok
			? { severity: "info", message: copy.notices.copied(scope) }
			: {
					severity: "error",
					message: copy.notices.clipboardWriteFailed(scope),
				},
	);

	// Copying a pane's text replaces what a grid copy put on the clipboard, so
	// the mark it left would point at cells this copy did not take. The
	// selection scope is not decided here: both copy and cut arrive with it, and
	// only the caller knows which one this is. A refused write changes nothing,
	// so it leaves an existing mark alone rather than clearing it.
	if (outcome.ok && scope !== "selection") {
		useTabeloStore.getState().clearCopiedRanges();
	}
	return outcome.ok;
}

// Resolves to the payload only when there is something to act on, so callers
// stay a single line and never repeat the failure handling.
export async function readTableFromClipboard(): Promise<ClipboardPayload | null> {
	const outcome = await readClipboardTable();
	if (outcome.ok) return outcome.payload;

	useTabeloStore.getState().pushNotice(clipboardReadNotice(outcome.reason));
	return null;
}

export async function pasteFromClipboard(): Promise<boolean> {
	const payload = await readTableFromClipboard();
	if (!payload) return false;
	const before = useTabeloStore.getState().document;
	useTabeloStore.getState().pasteClipboard(payload);
	return useTabeloStore.getState().document !== before;
}

function clipboardReadNotice(reason: ClipboardBlock): NoticeRequest {
	// An empty clipboard is not a failure to recover from: the user asked and
	// the answer is simply that there is nothing there. It is the one clipboard
	// outcome that is allowed to clear itself.
	return reason === "empty"
		? { severity: "info", message: copy.notices.clipboardEmpty }
		: { severity: "error", message: copy.notices.clipboardReadFailed };
}
