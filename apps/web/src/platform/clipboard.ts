import type { ClipboardPayload } from "@/clipboard/parse";

// The clipboard is the one browser API Tabelo uses that the user can refuse.
// Permission can be denied, the read half is absent in some browsers, and a
// restrictive context can remove the whole thing, so every call reports what
// happened instead of returning false and leaving the caller to guess.
//
// Trusted keyboard copy and paste arrive as events and never come through
// here, which is why the recovery advice everywhere is "use the keyboard": it
// keeps working in exactly the cases these calls do not.

export type ClipboardBlock =
	// The user or the page's permission policy refused.
	| "blocked"
	// The API, or the half of it being asked for, does not exist here.
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

// The DOM types declare every method as present, but Firefox ships no read(),
// and an insecure or restricted context removes the object entirely. Treating
// it as partial is what the runtime actually looks like.
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
	const api = clipboard();
	if (!api) return { ok: false, reason: "unavailable" };

	// A null result means the rich attempt failed in a way plain text might
	// survive; anything else is already the final answer.
	const read = api.read?.bind(api);
	const rich = read ? await readRich(read) : null;
	if (rich) return rich;

	if (!api.readText) return { ok: false, reason: "unavailable" };
	try {
		const text = await api.readText();
		return text
			? { ok: true, payload: { text } }
			: { ok: false, reason: "empty" };
	} catch (error) {
		return { ok: false, reason: reasonFor(error) };
	}
}

async function readRich(
	read: () => Promise<ClipboardItems>,
): Promise<ClipboardReadOutcome | null> {
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
		const reason = reasonFor(error);
		// A refusal applies to the whole clipboard, so falling through to
		// readText() would only produce the same refusal a second time.
		if (reason === "blocked") return { ok: false, reason };
		// Anything else may still be readable as plain text: Firefox has no
		// read() but does have readText().
		return null;
	}
}
