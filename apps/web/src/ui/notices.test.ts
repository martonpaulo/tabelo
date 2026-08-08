import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { conditionNoticeIds } from "@/state/notice-queue";
import { useTabeloStore } from "@/state/store";
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

describe("what is shown", () => {
	it("shows nothing at rest", () => {
		expect(current()).toEqual([]);
	});

	it("never lets a condition suppress a message", () => {
		useTabeloStore.setState({ storageIssue: { kind: "quota" } });
		useTabeloStore.getState().pushNotice({
			severity: "error",
			message: "It failed.",
		});

		expect(ids()).toContain(conditionNoticeIds.storage);
		expect(current()).toHaveLength(2);
		expect(current().at(-1)?.severity).toBe("error");
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

		expect(find(conditionNoticeIds.storage)?.detail).toBeDefined();
	});

	it("dismisses one notice without touching the others", () => {
		useTabeloStore.setState({ inputError: { code: "empty" } });
		useTabeloStore
			.getState()
			.pushNotice({ severity: "error", message: "It failed." });
		const message = ids().at(-1) ?? "";

		useTabeloStore.getState().dismissNotice(message);

		expect(ids()).toEqual([conditionNoticeIds.inputError]);

		useTabeloStore.getState().dismissNotice(conditionNoticeIds.inputError);

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
			document: documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true }),
		});
		useTabeloStore
			.getState()
			.importText('Name,Note\nIngrid,"unterminated', "csv");

		const notice = find(conditionNoticeIds.inputError);
		expect(notice?.severity).toBe("error");
		expect(notice?.urgency).toBe("assertive");
	});

	it.each(["unavailable", "quota"] as const)(
		"reports a %s storage failure as an error",
		(kind) => {
			useTabeloStore.setState({ storageIssue: { kind } });

			const notice = find(conditionNoticeIds.storage);
			expect(notice?.severity).toBe("error");
			expect(notice?.urgency).toBe("assertive");
		},
	);

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
			message: "Done.",
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
});
