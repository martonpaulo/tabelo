import type { ClipboardPayload } from "@/clipboard/parse";
import { type CopyScope, matrixToTsv } from "@/clipboard/serialize";
import { copy } from "@/copy/copy";
import { documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { htmlCodec } from "@/formats";
import type { TableCodec } from "@/formats/types";
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

export type { CopyScope };

export async function copyFormattedTableToClipboard(
	document: TableDocument,
): Promise<boolean> {
	const html = htmlCodec.serialize(document);
	const text = matrixToTsv(documentToMatrix(document));
	return copyToClipboard({ text, html }, "preview");
}

// The document as one chosen format, plain text and nothing else. No output
// options are applied: those are choices the download chooser offers about a
// file, and a copy that quietly honoured a setting made there would put text on
// the clipboard that no longer reads back as this table. Structured flavours
// belong to the commands that own them, the preview's rich-text table and the
// grid's typed payload, so a second HTML writer never appears here.
export async function copyCodecToClipboard(
	codec: TableCodec,
	document: TableDocument,
): Promise<boolean> {
	return copyToClipboard({ text: codec.serialize(document) }, "format");
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
