import { afterEach, describe, expect, it, vi } from "vitest";
import {
	readClipboardTable,
	writeClipboardTable,
	writeClipboardText,
} from "./clipboard";

// The clipboard is the one API the user can refuse, so each refusal shape is
// pinned here rather than discovered in a browser: a denial, a browser missing
// half the API, an empty clipboard, and an unrecognised fault all have to reach
// the caller as themselves.

const originalNavigator = globalThis.navigator;
const originalClipboardItem = globalThis.ClipboardItem;

function stubClipboard(clipboard: unknown): void {
	Object.defineProperty(globalThis, "navigator", {
		value: { clipboard },
		configurable: true,
		writable: true,
	});
}

function failure(name: string): DOMException {
	// A DOMException in the browser; the name is what every branch reads.
	return Object.assign(new Error(name), { name }) as unknown as DOMException;
}

function clipboardItem(types: Record<string, string>) {
	return {
		types: Object.keys(types),
		getType: async (type: string) => ({ text: async () => types[type] }),
	};
}

afterEach(() => {
	Object.defineProperty(globalThis, "navigator", {
		value: originalNavigator,
		configurable: true,
		writable: true,
	});
	Object.defineProperty(globalThis, "ClipboardItem", {
		value: originalClipboardItem,
		configurable: true,
		writable: true,
	});
	vi.restoreAllMocks();
});

describe("writing text", () => {
	it("reports success", async () => {
		stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
		expect(await writeClipboardText("a")).toEqual({
			ok: true,
			richness: "text",
		});
	});

	it("reports a denied permission as blocked", async () => {
		stubClipboard({
			writeText: vi.fn().mockRejectedValue(failure("NotAllowedError")),
		});
		expect(await writeClipboardText("a")).toEqual({
			ok: false,
			reason: "blocked",
		});
	});

	it("reports a missing API rather than throwing", async () => {
		stubClipboard(undefined);
		expect(await writeClipboardText("a")).toEqual({
			ok: false,
			reason: "unavailable",
		});
	});

	it("reports an unrecognised fault as unknown", async () => {
		stubClipboard({
			writeText: vi.fn().mockRejectedValue(failure("WeirdError")),
		});
		expect(await writeClipboardText("a")).toEqual({
			ok: false,
			reason: "unknown",
		});
	});
});

describe("writing a table", () => {
	it("keeps the rich flavour when the browser takes it", async () => {
		const write = vi.fn().mockResolvedValue(undefined);
		stubClipboard({ write, writeText: vi.fn() });
		Object.defineProperty(globalThis, "ClipboardItem", {
			value: class {
				constructor(readonly items: unknown) {}
			},
			configurable: true,
			writable: true,
		});

		expect(await writeClipboardTable("a\tb", "<table></table>")).toEqual({
			ok: true,
			richness: "table",
		});
		expect(write).toHaveBeenCalled();
	});

	it("falls back to plain text when rich writing is unsupported", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		stubClipboard({
			write: vi.fn().mockRejectedValue(failure("NotSupportedError")),
			writeText,
		});
		Object.defineProperty(globalThis, "ClipboardItem", {
			value: class {},
			configurable: true,
			writable: true,
		});

		expect(await writeClipboardTable("a\tb", "<table></table>")).toEqual({
			ok: true,
			richness: "text",
		});
		expect(writeText).toHaveBeenCalledWith("a\tb");
	});

	it("does not retry a refusal as plain text", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		stubClipboard({
			write: vi.fn().mockRejectedValue(failure("NotAllowedError")),
			writeText,
		});
		Object.defineProperty(globalThis, "ClipboardItem", {
			value: class {},
			configurable: true,
			writable: true,
		});

		expect(await writeClipboardTable("a\tb", "<table></table>")).toEqual({
			ok: false,
			reason: "blocked",
		});
		expect(writeText).not.toHaveBeenCalled();
	});

	it("uses plain text when ClipboardItem does not exist", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		stubClipboard({ write: vi.fn(), writeText });
		Object.defineProperty(globalThis, "ClipboardItem", {
			value: undefined,
			configurable: true,
			writable: true,
		});

		expect(await writeClipboardTable("a\tb", "<b/>")).toEqual({
			ok: true,
			richness: "text",
		});
	});
});

describe("reading the clipboard", () => {
	it("prefers the rich flavour and keeps both parts", async () => {
		stubClipboard({
			read: vi
				.fn()
				.mockResolvedValue([
					clipboardItem({ "text/plain": "a\tb", "text/html": "<table/>" }),
				]),
			readText: vi.fn(),
		});

		expect(await readClipboardTable()).toEqual({
			ok: true,
			payload: { text: "a\tb", html: "<table/>" },
		});
	});

	// Firefox implements readText() but not read(), and the button path has to
	// keep working there rather than reporting a failure.
	it("falls back to plain text when read() is absent", async () => {
		stubClipboard({ readText: vi.fn().mockResolvedValue("a\tb") });

		expect(await readClipboardTable()).toEqual({
			ok: true,
			payload: { text: "a\tb" },
		});
	});

	it("falls back to plain text when read() fails recoverably", async () => {
		const readText = vi.fn().mockResolvedValue("a\tb");
		stubClipboard({
			read: vi.fn().mockRejectedValue(failure("NotSupportedError")),
			readText,
		});

		expect(await readClipboardTable()).toEqual({
			ok: true,
			payload: { text: "a\tb" },
		});
		expect(readText).toHaveBeenCalled();
	});

	it("does not retry a refusal as plain text", async () => {
		const readText = vi.fn().mockResolvedValue("a\tb");
		stubClipboard({
			read: vi.fn().mockRejectedValue(failure("NotAllowedError")),
			readText,
		});

		expect(await readClipboardTable()).toEqual({
			ok: false,
			reason: "blocked",
		});
		expect(readText).not.toHaveBeenCalled();
	});

	it("distinguishes an empty clipboard from a blocked one", async () => {
		stubClipboard({
			read: vi.fn().mockResolvedValue([]),
			readText: vi.fn(),
		});
		expect(await readClipboardTable()).toEqual({ ok: false, reason: "empty" });

		stubClipboard({ readText: vi.fn().mockResolvedValue("") });
		expect(await readClipboardTable()).toEqual({ ok: false, reason: "empty" });
	});

	it("reports a missing API rather than throwing", async () => {
		stubClipboard(undefined);
		expect(await readClipboardTable()).toEqual({
			ok: false,
			reason: "unavailable",
		});

		stubClipboard({});
		expect(await readClipboardTable()).toEqual({
			ok: false,
			reason: "unavailable",
		});
	});

	it("reports an unrecognised fault as unknown", async () => {
		stubClipboard({
			readText: vi.fn().mockRejectedValue(failure("WeirdError")),
		});
		expect(await readClipboardTable()).toEqual({
			ok: false,
			reason: "unknown",
		});
	});
});
