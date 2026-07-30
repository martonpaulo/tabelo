import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { conditionNoticeIds } from "@/state/notice-queue";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import {
	type AppNotice,
	appNotices,
	autoDismissDelay,
	NOTICE_AUTO_DISMISS_MS,
} from "@/ui/notices";

// The notice list is the whole render input. These tests pin the three rules
// the previous precedence chain broke: nothing is suppressed, tone follows the
// message rather than the slot it arrived in, and only a plain confirmation is
// allowed to expire on its own.

const initialState = useTabeloStore.getInitialState();

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
});

function current(): readonly AppNotice[] {
	const state = useTabeloStore.getState();
	return appNotices(state);
}

function ids(): readonly string[] {
	return current().map((notice) => notice.id);
}

function find(id: string): AppNotice | undefined {
	return current().find((notice) => notice.id === id);
}

function pasteWithHeaderGuess(): void {
	useTabeloStore
		.getState()
		.pasteClipboard({ text: "Name\tRole\nInez\tDesigner" });
}

describe("what is shown", () => {
	it("shows nothing at rest", () => {
		expect(current()).toEqual([]);
	});

	// The exact defect: a refused clipboard write behind a header correction.
	it("never lets a condition suppress a message", () => {
		pasteWithHeaderGuess();
		useTabeloStore.getState().pushNotice({
			severity: "error",
			message: copy.notices.clipboardWriteFailed("selection"),
		});

		expect(current().map((notice) => notice.message)).toEqual([
			copy.notices.headerGuess,
			copy.notices.clipboardWriteFailed("selection"),
		]);
	});

	it("puts conditions before the messages that arrived later", () => {
		useTabeloStore
			.getState()
			.pushNotice({ severity: "info", message: "Done." });
		useTabeloStore.setState({ storageIssue: { kind: "quota" } });

		expect(ids()[0]).toBe(conditionNoticeIds.storage);
	});
});

describe("conditions are state, not messages", () => {
	it("clears a projected notice when its state clears, with no dismissal", () => {
		pasteWithHeaderGuess();
		expect(ids()).toContain(conditionNoticeIds.headerCorrection);

		useTabeloStore.getState().editCell(0, 0, "Mark");

		expect(ids()).not.toContain(conditionNoticeIds.headerCorrection);
	});

	it("keeps reflecting the condition it describes as that condition changes", () => {
		useTabeloStore.setState({
			storageIssue: { kind: "unreadable", raw: "{}" },
		});
		expect(find(conditionNoticeIds.storage)?.detail).toBeUndefined();

		useTabeloStore.setState({
			storageIssue: {
				kind: "unreadable",
				raw: "{}",
				replacementFailure: "quota",
			},
		});

		expect(find(conditionNoticeIds.storage)?.detail).toBe(
			copy.notices.storageRecoveryQuota,
		);
	});

	it("dismisses one notice without touching the others", () => {
		pasteWithHeaderGuess();
		useTabeloStore
			.getState()
			.pushNotice({ severity: "error", message: "It failed." });
		const message = ids().at(-1) ?? "";

		useTabeloStore.getState().dismissNotice(message);

		expect(ids()).toEqual([conditionNoticeIds.headerCorrection]);

		useTabeloStore
			.getState()
			.dismissNotice(conditionNoticeIds.headerCorrection);

		expect(ids()).toEqual([]);
	});

	it("does not offer to dismiss a storage failure, which is still true either way", () => {
		useTabeloStore.setState({ storageIssue: { kind: "unavailable" } });

		expect(find(conditionNoticeIds.storage)?.dismissible).toBe(false);
	});
});

describe("severity and urgency", () => {
	it("reports a refused import as an error that interrupts", () => {
		useTabeloStore.setState({
			document: documentFromMatrix([["Name"], ["Inez"]], { headerRow: true }),
		});
		useTabeloStore
			.getState()
			.importText('Name,Note\nInez,"unterminated', "csv");

		const notice = find(conditionNoticeIds.inputError);
		expect(notice?.severity).toBe("error");
		expect(notice?.urgency).toBe("assertive");
	});

	it.each([
		["unavailable", copy.notices.storageUnavailable],
		["quota", copy.notices.storageQuota],
	] as const)("reports a %s storage failure as an error", (kind, message) => {
		useTabeloStore.setState({ storageIssue: { kind } });

		const notice = find(conditionNoticeIds.storage);
		expect(notice?.message).toBe(message);
		expect(notice?.severity).toBe("error");
		expect(notice?.urgency).toBe("assertive");
	});

	it("keeps the header guess informational and polite", () => {
		pasteWithHeaderGuess();

		const notice = find(conditionNoticeIds.headerCorrection);
		expect(notice?.severity).toBe("info");
		expect(notice?.urgency).toBe("polite");
	});

	it("carries the severity a message was pushed with", () => {
		useTabeloStore
			.getState()
			.pushNotice({ severity: "error", message: "It failed." });

		expect(current().at(-1)?.severity).toBe("error");
	});
});

describe("what may expire on its own", () => {
	it("lets a plain confirmation clear itself", () => {
		useTabeloStore.getState().pushNotice({
			severity: "info",
			message: copy.notices.copied("selection"),
		});

		expect(autoDismissDelay(current()[0] as AppNotice)).toBe(
			NOTICE_AUTO_DISMISS_MS,
		);
	});

	it.each(["error", "warning"] as const)(
		"keeps a %s until it is read",
		(severity) => {
			useTabeloStore.getState().pushNotice({ severity, message: "It failed." });

			expect(autoDismissDelay(current()[0] as AppNotice)).toBeNull();
		},
	);

	// A four-second window is not long enough to notice, decide, and click.
	it("keeps anything carrying an action, however calm it reads", () => {
		pasteWithHeaderGuess();
		const notice = find(conditionNoticeIds.headerCorrection) as AppNotice;

		expect(notice.severity).toBe("info");
		expect(notice.actions).not.toHaveLength(0);
		expect(autoDismissDelay(notice)).toBeNull();
	});
});

describe("actions", () => {
	it("runs the header correction through the document timeline", () => {
		pasteWithHeaderGuess();
		const notice = find(conditionNoticeIds.headerCorrection) as AppNotice;

		notice.actions[0]?.run();

		// The guessed header row moves down into the data it always was, and the
		// header row it leaves behind is empty rather than generated.
		const document = useTabeloStore.getState().document;
		expect(document.columns[0]?.header).toBe("");
		expect(document.rows[0]?.cells[document.columns[0]?.id ?? ""]).toBe("Name");
		expect(ids()).toEqual([]);
	});
});
