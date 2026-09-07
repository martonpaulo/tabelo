import type { ClipboardPayload } from "@/clipboard/parse";

// The clipboard is the one browser API Tabelo uses that the user can refuse.
// Permission can be denied and a restrictive context can remove the whole
// thing, so every call reports what happened instead of returning false and
// leaving the caller to guess.
//
// Trusted keyboard copy and paste arrive as events and never come through
// here, which is why the recovery advice everywhere is "use the keyboard": it
// keeps working in exactly the cases these calls do not.

export type ClipboardBlock =
	// The user or the page's permission policy refused.
	| "blocked"
	// The API does not exist here.
	| "unavailable"
	// The call worked and there was nothing to read.
	| "empty"
	| "unknown";

export type ClipboardWriteOutcome =
	// Rich writes carry a spreadsheet-compatible HTML flavour beside the text.
	// When the browser will not take both, the text still lands, so this is a
	// success with less in it rather than a failure.
	| { readonly ok: true; readonly richness: "table" | "text" }
	| { readonly ok: false; readonly reason: ClipboardBlock };

export type ClipboardReadOutcome =
	| { readonly ok: true; readonly payload: ClipboardPayload }
	| { readonly ok: false; readonly reason: ClipboardBlock };

// Browsers disagree about the error type but agree about the name, and mocks
// throw plain errors, so the name is read structurally rather than by class.
function reasonFor(error: unknown): ClipboardBlock {
	const name =
		typeof error === "object" && error !== null && "name" in error
			? String((error as { name: unknown }).name)
			: "";

	switch (name) {
		case "NotAllowedError":
		case "SecurityError":
			return "blocked";
		case "NotSupportedError":
		case "TypeError":
			return "unavailable";
		case "NotFoundError":
			return "empty";
		default:
			return "unknown";
	}
}

// The DOM types declare the object as always present, but an insecure or
// restricted context removes it entirely. Treating it as partial is what the
// runtime actually looks like.
function clipboard(): Partial<Clipboard> | undefined {
	return typeof navigator === "undefined" ? undefined : navigator.clipboard;
}

export async function writeClipboardText(
	text: string,
): Promise<ClipboardWriteOutcome> {
	const api = clipboard();
	if (!api?.writeText) return { ok: false, reason: "unavailable" };
	try {
		await api.writeText(text);
		return { ok: true, richness: "text" };
	} catch (error) {
		return { ok: false, reason: reasonFor(error) };
	}
}

export async function writeClipboardTable(
	text: string,
	html: string,
): Promise<ClipboardWriteOutcome> {
	const api = clipboard();
	if (!api?.write || typeof ClipboardItem === "undefined") {
		return writeClipboardText(text);
	}

	try {
		await api.write([
			new ClipboardItem({
				"text/plain": new Blob([text], { type: "text/plain" }),
				"text/html": new Blob([html], { type: "text/html" }),
			}),
		]);
		return { ok: true, richness: "table" };
	} catch (error) {
		// A refusal is about permission, not about richness, so retrying as plain
		// text would only fail again and would hide why.
		if (reasonFor(error) === "blocked") return { ok: false, reason: "blocked" };
		return writeClipboardText(text);
	}
}

export async function readClipboardTable(): Promise<ClipboardReadOutcome> {
	// The object arrives whole or not at all: there is no second attempt to make
	// when it is absent, because the same context that removes read() removes
	// readText() beside it.
	const api = clipboard();
	if (!api?.read) return { ok: false, reason: "unavailable" };
	return readRich(api.read.bind(api));
}

async function readRich(
	read: () => Promise<ClipboardItems>,
): Promise<ClipboardReadOutcome> {
	try {
		const items = await read();
		let text = "";
		let html: string | undefined;
		for (const item of items) {
			if (item.types.includes("text/html")) {
				html = await (await item.getType("text/html")).text();
			}
			if (item.types.includes("text/plain")) {
				text = await (await item.getType("text/plain")).text();
			}
		}
		if (!text && !html) return { ok: false, reason: "empty" };
		return { ok: true, payload: { text, html } };
	} catch (error) {
		return { ok: false, reason: reasonFor(error) };
	}
}
