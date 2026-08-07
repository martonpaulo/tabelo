import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ClipboardReadOutcome,
	ClipboardWriteOutcome,
} from "@/platform/clipboard";
import type { NoticeSeverity, TransientNotice } from "@/state/notice-queue";

// A refused clipboard must never look like a click that did nothing, and a cut
// must never clear a selection it failed to copy. Both are verified against the
// real store with only the browser boundary replaced.

const writeClipboardText = vi.fn<() => Promise<ClipboardWriteOutcome>>();
const writeClipboardTable = vi.fn<() => Promise<ClipboardWriteOutcome>>();
const readClipboardTable = vi.fn<() => Promise<ClipboardReadOutcome>>();

vi.mock("@/platform/clipboard", () => ({
	writeClipboardText: () => writeClipboardText(),
	writeClipboardTable: () => writeClipboardTable(),
	readClipboardTable: () => readClipboardTable(),
}));

const { documentFromMatrix, documentToMatrix } = await import(
	"@/core/document"
);
const { createSelection } = await import("@/core/selection");
const { useTabeloStore } = await import("@/state/store");

const { copyToClipboard, pasteFromClipboard, readTableFromClipboard } =
	await import("./clipboard-actions");
const { buildTableActions } = await import("./grid/table-actions");

const initialState = useTabeloStore.getInitialState();

const granted: ClipboardWriteOutcome = { ok: true, richness: "table" };
const refused: ClipboardWriteOutcome = { ok: false, reason: "blocked" };

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
	vi.clearAllMocks();
	writeClipboardText.mockResolvedValue({ ok: true, richness: "text" });
	writeClipboardTable.mockResolvedValue(granted);
});

function latest(): TransientNotice | null {
	return useTabeloStore.getState().notices.at(-1) ?? null;
}

function notice(): string | null {
	return latest()?.message ?? null;
}

function severity(): NoticeSeverity | null {
	return latest()?.severity ?? null;
}

describe("copying", () => {
	it("confirms a copied selection", async () => {
		expect(
			await copyToClipboard({ text: "a", html: "<b/>" }, "selection"),
		).toBe(true);
		expect(notice()).not.toBeNull();
		expect(severity()).toBe("info");
	});

	it("uses the rich write only when there is a rich flavour to send", async () => {
		await copyToClipboard({ text: "a", html: "<b/>" }, "selection");
		expect(writeClipboardTable).toHaveBeenCalled();
		expect(writeClipboardText).not.toHaveBeenCalled();

		vi.clearAllMocks();
		writeClipboardText.mockResolvedValue({ ok: true, richness: "text" });
		await copyToClipboard({ text: "| A |" }, "source");
		expect(writeClipboardText).toHaveBeenCalled();
		expect(writeClipboardTable).not.toHaveBeenCalled();
	});

	it("explains a refusal and points at the keyboard", async () => {
		writeClipboardTable.mockResolvedValue(refused);

		expect(
			await copyToClipboard({ text: "a", html: "<b/>" }, "selection"),
		).toBe(false);
		expect(notice()).not.toBeNull();
		// A failure is a failure wherever it was produced. This one used to
		// arrive in the informational tone, in the lowest-ranked slot.
		expect(severity()).toBe("error");
	});

	it("keeps an earlier message rather than replacing it", async () => {
		writeClipboardTable.mockResolvedValue(refused);
		await copyToClipboard({ text: "a", html: "<b/>" }, "selection");
		writeClipboardText.mockResolvedValue({ ok: true, richness: "text" });
		await copyToClipboard({ text: "| A |" }, "source");

		expect(useTabeloStore.getState().notices).toHaveLength(2);
	});

	it("never reveals the underlying permission error", async () => {
		writeClipboardTable.mockResolvedValue({ ok: false, reason: "unknown" });
		await copyToClipboard({ text: "a", html: "<b/>" }, "selection");
		expect(notice()).not.toMatch(/error|exception|permission denied/i);
	});
});

describe("reading", () => {
	it("returns the payload when the clipboard can be read", async () => {
		readClipboardTable.mockResolvedValue({
			ok: true,
			payload: { text: "a\tb" },
		});

		expect(await readTableFromClipboard()).toEqual({ text: "a\tb" });
		expect(notice()).toBeNull();
	});

	it.each(["blocked", "unavailable", "unknown"] as const)(
		"explains a %s clipboard and points at the keyboard",
		async (reason) => {
			readClipboardTable.mockResolvedValue({ ok: false, reason });

			expect(await readTableFromClipboard()).toBeNull();
			expect(notice()).not.toBeNull();
			expect(severity()).toBe("error");
		},
	);

	it("says an empty clipboard is empty rather than blocked", async () => {
		readClipboardTable.mockResolvedValue({ ok: false, reason: "empty" });

		expect(await readTableFromClipboard()).toBeNull();
		expect(notice()).not.toBeNull();
		expect(severity()).toBe("info");
	});

	it("leaves the table untouched when the clipboard cannot be read", async () => {
		useTabeloStore.setState({
			document: documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true }),
		});
		const before = useTabeloStore.getState().document;
		readClipboardTable.mockResolvedValue({ ok: false, reason: "blocked" });

		await pasteFromClipboard();

		expect(useTabeloStore.getState().document).toBe(before);
	});
});

describe("cutting", () => {
	function cut(): () => void {
		const action = buildTableActions({ axis: "cell" })
			.flatMap((group) => group.actions)
			.find((candidate) => candidate.id === "cut");
		expect(action).toBeDefined();
		return action?.run ?? (() => {});
	}

	beforeEach(() => {
		useTabeloStore.setState({
			document: documentFromMatrix(
				[
					["Name", "Role"],
					["Ingrid", "Designer"],
				],
				{ headerRow: true },
			),
			selection: createSelection({ row: 0, column: 0 }),
		});
	});

	it("clears the selection once the copy has landed", async () => {
		cut()();
		await vi.waitFor(() =>
			expect(documentToMatrix(useTabeloStore.getState().document)[1][0]).toBe(
				"",
			),
		);
	});

	// The data only exists in one place until the copy succeeds, so a refused
	// clipboard must leave it exactly where it is.
	it("never destroys the selection after a refused copy", async () => {
		writeClipboardTable.mockResolvedValue(refused);
		const before = documentToMatrix(useTabeloStore.getState().document);

		cut()();

		await vi.waitFor(() => expect(notice()).not.toBeNull());
		expect(documentToMatrix(useTabeloStore.getState().document)).toEqual(
			before,
		);
	});
});

describe("the copied range", () => {
	function action(id: string): () => void {
		const found = buildTableActions({ axis: "cell" })
			.flatMap((group) => group.actions)
			.find((candidate) => candidate.id === id);
		expect(found).toBeDefined();
		return found?.run ?? (() => {});
	}

	beforeEach(() => {
		useTabeloStore.setState({
			document: documentFromMatrix(
				[
					["Name", "Role"],
					["Ingrid", "Designer"],
					["Paulo", "Engineer"],
				],
				{ headerRow: true },
			),
			selection: createSelection({ row: 0, column: 0 }),
		});
	});

	it("marks what a menu copy took", async () => {
		action("copy")();

		await vi.waitFor(() =>
			expect(useTabeloStore.getState().copiedRange).toEqual({
				top: 0,
				left: 0,
				bottom: 0,
				right: 0,
			}),
		);
	});

	// Tabelo's cut empties the cells now rather than on paste, so a mark would
	// outline blank cells and promise a move that never arrives.
	it("is never left behind by a cut, and an earlier one is dropped", async () => {
		action("copy")();
		await vi.waitFor(() =>
			expect(useTabeloStore.getState().copiedRange).not.toBeNull(),
		);

		action("cut")();

		await vi.waitFor(() =>
			expect(useTabeloStore.getState().copiedRange).toBeNull(),
		);
	});

	// Nothing reached the clipboard, so the previous mark still describes what
	// is on it.
	it("survives a refused copy, which changed nothing", async () => {
		action("copy")();
		await vi.waitFor(() =>
			expect(useTabeloStore.getState().copiedRange).not.toBeNull(),
		);
		const marked = useTabeloStore.getState().copiedRange;
		writeClipboardTable.mockResolvedValue(refused);
		useTabeloStore.getState().selectCell({ row: 1, column: 1 });

		action("copy")();

		await vi.waitFor(() => expect(severity()).toBe("error"));
		expect(useTabeloStore.getState().copiedRange).toBe(marked);
	});

	// The clipboard now holds a pane's text, so the grid mark would point at
	// cells that copy did not take.
	it("is dropped when a source or preview copy replaces the clipboard", async () => {
		action("copy")();
		await vi.waitFor(() =>
			expect(useTabeloStore.getState().copiedRange).not.toBeNull(),
		);

		await copyToClipboard({ text: "| Name |" }, "source");

		expect(useTabeloStore.getState().copiedRange).toBeNull();
	});
});
