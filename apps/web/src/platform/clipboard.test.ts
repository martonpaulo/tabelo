import { afterEach, describe, expect, it, vi } from "vitest";
import {
	readClipboardTable,
	writeClipboardTable,
	writeClipboardText,
} from "./clipboard";

// The clipboard is the one API the user can refuse, so each refusal shape is
// pinned here rather than discovered in a browser: a denial, a context with no
// clipboard object at all, an empty clipboard, and an unrecognised fault all
// have to reach the caller as themselves.

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

// There is one read path. The clipboard object arrives whole or not at all, so
// a failed read is the answer rather than a reason to try a second half of the
// API: `readText` is never consulted here, and these pin that.
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

	it("reports a clipboard without read() as unavailable", async () => {
		const readText = vi.fn().mockResolvedValue("a\tb");
		stubClipboard({ readText });

		expect(await readClipboardTable()).toEqual({
			ok: false,
			reason: "unavailable",
		});
		expect(readText).not.toHaveBeenCalled();
	});

	it.each([
		["NotSupportedError", "unavailable"],
		["NotAllowedError", "blocked"],
		["WeirdError", "unknown"],
	])(
		"reports a failed read as %s without a second attempt",
		async (name, reason) => {
			const readText = vi.fn().mockResolvedValue("a\tb");
			stubClipboard({
				read: vi.fn().mockRejectedValue(failure(name)),
				readText,
			});

			expect(await readClipboardTable()).toEqual({ ok: false, reason });
			expect(readText).not.toHaveBeenCalled();
		},
	);

	it("distinguishes an empty clipboard from a blocked one", async () => {
		stubClipboard({ read: vi.fn().mockResolvedValue([]) });
		expect(await readClipboardTable()).toEqual({ ok: false, reason: "empty" });

		stubClipboard({
			read: vi.fn().mockResolvedValue([clipboardItem({ "text/plain": "" })]),
		});
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
});
