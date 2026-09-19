import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentFromMatrix } from "@/core/document";
import type { PersistenceFailureReason } from "@/persistence/schema";
import * as files from "@/platform/files";
import type { PreferencesIssue } from "@/preferences/store";
import { conditionNoticeIds } from "@/state/notice-queue";
import { useTabeloStore } from "@/state/store";
import {
	type AppNotice,
	appNotices,
	autoDismissDelay,
	NOTICE_AUTO_DISMISS_MS,
	projectionLossOf,
	UNDO_NOTICE_DISMISS_MS,
	undoableNoticeId,
} from "@/ui/notices";
import type { ViewId } from "@/views/types";

// The notice list is the whole render input. These tests pin the three rules
// the previous precedence chain broke: nothing is suppressed, tone follows the
// message rather than the slot it arrived in, and only a plain confirmation is
// allowed to expire on its own.

const initialState = useTabeloStore.getInitialState();

// The preferences store is a module singleton read from real storage, so the
// issue it would report is supplied directly here.
let preferencesIssue: PreferencesIssue | null = null;

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
	preferencesIssue = null;
});

function current(): readonly AppNotice[] {
	const state = useTabeloStore.getState();
	return appNotices({
		...state,
		preferencesIssue,
		undoableNoticeId: undoableNoticeId(state),
	});
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

// #306. A formatted table open in a view that shows it only as text is
// disclosed, and the disclosure is derived from the document and the open
// views rather than raised by an event.
describe("the plain projection disclosure", () => {
	const formatted = documentFromMatrix(
		[
			["Name"],
			[
				{
					kind: "inline",
					nodes: [{ kind: "text", text: "Ingrid", marks: ["bold"] }],
				},
			],
		],
		{ headerRow: true },
	);

	function showIn(view: ViewId) {
		const [first] = useTabeloStore.getState().workspace.panes;
		if (!first) throw new Error("the workspace has a pane");
		useTabeloStore.setState((state) => ({
			workspace: {
				...state.workspace,
				panes: state.workspace.panes.map((pane) =>
					pane.id === first.id ? { ...pane, view } : pane,
				),
			},
		}));
	}

	function disclosed(): AppNotice | undefined {
		const state = useTabeloStore.getState();
		return appNotices({
			...state,
			preferencesIssue,
			projectionLoss: projectionLossOf(state),
		}).find((notice) => notice.id === conditionNoticeIds.projectionLoss);
	}

	it("appears only while formatted content is open in a plain view", () => {
		showIn("csv");
		expect(disclosed()).toBeUndefined();

		useTabeloStore.setState({ document: formatted });
		expect(disclosed()?.severity).toBe("warning");
		expect(disclosed()?.dismissible).toBe(true);

		showIn("jira");
		expect(disclosed()).toBeUndefined();
	});

	it("stays dismissed for the views it was dismissed for", () => {
		useTabeloStore.setState({ document: formatted });
		showIn("csv");
		useTabeloStore.getState().dismissNotice(conditionNoticeIds.projectionLoss);
		expect(disclosed()).toBeUndefined();

		showIn("tsv");
		expect(disclosed()).toBeDefined();
	});
});

describe("conditions are state, not messages", () => {
	it("keeps reflecting the condition it describes as that condition changes", () => {
		useTabeloStore.setState({
			storageIssue: { kind: "unreadable", reason: "invalid-json", raw: "{}" },
		});
		const before = find(conditionNoticeIds.storage)?.detail;

		useTabeloStore.setState({
			storageIssue: {
				kind: "unreadable",
				reason: "invalid-json",
				raw: "{}",
				replacementFailure: "quota",
			},
		});

		expect(find(conditionNoticeIds.storage)?.detail).toBeDefined();
		expect(find(conditionNoticeIds.storage)?.detail).not.toBe(before);
	});

	// #306: formatting an import or a paste could not keep is reported, as a
	// warning the user dismisses rather than one that expires unread.
	it("reports formatting an import left behind until it is dismissed", () => {
		expect(find(conditionNoticeIds.importWarnings)).toBeUndefined();
		useTabeloStore.setState({
			importWarnings: [
				{ code: "html-formatting-unsupported", tag: "mark" },
				{ code: "html-formatting-unsupported", tag: "mark" },
			],
		});
		const notice = find(conditionNoticeIds.importWarnings);
		expect(notice?.severity).toBe("warning");
		expect(notice?.dismissible).toBe(true);
		expect(notice && autoDismissDelay(notice)).toBeNull();

		useTabeloStore.getState().dismissNotice(conditionNoticeIds.importWarnings);
		expect(find(conditionNoticeIds.importWarnings)).toBeUndefined();
	});

	// #32: "saved by a newer Tabelo" and "damaged" set opposite expectations,
	// so the two must not read alike. Compared with each other rather than
	// with the copy that renders them.
	it("tells saved-by-another-version apart from damaged", () => {
		const messageFor = (reason: PersistenceFailureReason) => {
			useTabeloStore.setState({
				storageIssue: { kind: "unreadable", reason, raw: "{}" },
			});
			return find(conditionNoticeIds.storage)?.message;
		};
		const damaged = messageFor("current-schema-invalid");

		expect(messageFor("future-version")).not.toBe(damaged);
		expect(messageFor("migration-failed")).not.toBe(damaged);
		expect(messageFor("future-version")).not.toBe(
			messageFor("migration-failed"),
		);
	});

	it("downloads the saved bytes untouched, as a JSON file", () => {
		const raw = '{"version": 99, "keep": "exactly\tthis"';
		const download = vi
			.spyOn(files, "downloadText")
			.mockImplementation(() => {});
		useTabeloStore.setState({
			storageIssue: { kind: "unreadable", reason: "future-version", raw },
		});

		find(conditionNoticeIds.storage)
			?.actions.find((action) => action.id === "download-original")
			?.run();

		expect(download).toHaveBeenCalledTimes(1);
		const [filename, mimeType, contents] = download.mock.calls[0] ?? [];
		expect(filename).toMatch(/\.json$/);
		expect(mimeType).toBe("application/json");
		expect(contents).toBe(raw);
		download.mockRestore();
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

	it("reports unreadable settings beside the table's own notice, with their bytes untouched", () => {
		const raw = '{"version": 99, "wrap": true';
		const download = vi
			.spyOn(files, "downloadText")
			.mockImplementation(() => {});
		useTabeloStore.setState({ storageIssue: { kind: "unavailable" } });
		preferencesIssue = { kind: "unreadable", reason: "future-version", raw };

		expect(ids()).toEqual([
			conditionNoticeIds.storage,
			conditionNoticeIds.preferencesStorage,
		]);
		const notice = find(conditionNoticeIds.preferencesStorage);
		// Nothing in the table is at risk, so it does not interrupt, but it stays
		// until the settings are replaced.
		expect(notice?.severity).toBe("warning");
		expect(notice?.urgency).toBe("polite");
		expect(notice?.dismissible).toBe(false);
		expect(notice && autoDismissDelay(notice)).toBeNull();

		notice?.actions
			.find((action) => action.id === "download-original-settings")
			?.run();

		const [filename, mimeType, contents] = download.mock.calls[0] ?? [];
		expect(filename).toMatch(/\.json$/);
		expect(mimeType).toBe("application/json");
		expect(contents).toBe(raw);
		download.mockRestore();
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

describe("offering undo after a whole-table command (#235)", () => {
	function transpose(): void {
		useTabeloStore.setState({
			document: documentFromMatrix(
				[
					["name", "city"],
					["Ingrid", "Rio"],
				],
				{ headerRow: true },
			),
		});
		const store = useTabeloStore.getState();
		store.transposeTable();
		store.pushNotice({
			severity: "info",
			message: "Done.",
			undoFor: useTabeloStore.getState().document,
		});
	}

	it("undoes the command and removes the notice", () => {
		transpose();
		const before = useTabeloStore.getState().past[0]?.document;
		const notice = current()[0] as AppNotice;
		expect(notice.actions).toHaveLength(1);
		expect(autoDismissDelay(notice)).toBe(UNDO_NOTICE_DISMISS_MS);

		notice.actions[0]?.run();

		expect(useTabeloStore.getState().document).toBe(before);
		expect(current()).toEqual([]);
	});

	it("stops offering undo once the document moves on", () => {
		transpose();
		useTabeloStore.getState().editCell(0, 0, "Paulo");

		const notice = current()[0] as AppNotice;
		expect(notice.actions).toEqual([]);
		expect(autoDismissDelay(notice)).toBe(NOTICE_AUTO_DISMISS_MS);
	});
});
