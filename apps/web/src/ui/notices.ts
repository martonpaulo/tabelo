import { copy } from "@/copy/copy";
import { hasInlineContent } from "@/core/document";
import type { FillSeriesOffer } from "@/core/series";
import type { TableDocument } from "@/core/types";
import { getCodec } from "@/formats";
import type { ParseIssue } from "@/formats/types";
import type { ImportError } from "@/import/prepare";
import { downloadText, tableDownloadFilename } from "@/platform/files";
import { type PreferencesIssue, preferencesStore } from "@/preferences/store";
import {
	conditionNoticeIds,
	type NoticeSeverity,
	type NoticeUrgency,
	type TransientNotice,
} from "@/state/notice-queue";
import type { PendingPaneAction, StorageIssue } from "@/state/store";
import { useTabeloStore } from "@/state/store";
import { codecSpelling } from "@/ui/spelling";
import {
	plainEditableViews,
	plainViewsSignature,
} from "@/views/projection-loss";
import type { ViewDefinition } from "@/views/types";
import type { Workspace } from "@/workspace/layout";

// Everything the notice area has to say, in one list. Two kinds of thing end
// up here and they behave differently:
//
// A condition (storage failure, import refusal, or pending pane action) is
// state. It lasts until whatever caused it is resolved, so it is
// projected on every read and disappears on its own when the state clears.
//
// A message is a one-off report of something that already happened. It is
// queued in the store and stays until it is dismissed or, when it is a plain
// confirmation, until it expires.
//
// The list is the render input in full. Nothing is ranked, and nothing is
// suppressed: that was how a refused clipboard write used to vanish behind an
// unrelated notice, taking its recovery instructions with it.

export interface NoticeAction {
	readonly id: string;
	readonly label: string;
	readonly run: () => void;
	// An Undo offer repeats a command that stays on Mod+Z and in the menu, so
	// the notice carrying it may still expire: expiry removes no way back.
	readonly undo?: true;
}

export interface AppNotice {
	readonly id: string;
	readonly severity: NoticeSeverity;
	readonly urgency: NoticeUrgency;
	readonly message: string;
	// A second sentence that qualifies the message, such as why a recovery copy
	// could not be written. Read out with the message, never on its own.
	readonly detail?: string;
	readonly actions: readonly NoticeAction[];
	readonly dismissible: boolean;
}

export interface NoticeSources {
	readonly storageIssue: StorageIssue | null;
	readonly preferencesIssue: PreferencesIssue | null;
	readonly inputError: ImportError | null;
	// What the last import or paste kept only as text (#306).
	readonly importWarnings?: readonly ParseIssue[];
	readonly pendingPaneAction: PendingPaneAction | null;
	readonly fillSeriesOffer: FillSeriesOffer | null;
	readonly notices: readonly TransientNotice[];
	// The plain views a formatted document is open in, when the user has not
	// dismissed the disclosure for exactly these views (#306).
	readonly projectionLoss?: ProjectionLoss | null;
	// The transient notice whose Undo still applies, from `undoableNoticeId`.
	readonly undoableNoticeId?: string | null;
}

export interface ProjectionLoss {
	readonly views: readonly ViewDefinition[];
}

// The projection-loss condition, derived and never stored: the document holds
// inline structure, and at least one open view that can edit it shows it only
// as text. A dismissal holds for the set of views it was given for.
export function projectionLossOf(state: {
	readonly document: TableDocument;
	readonly workspace: Workspace;
	readonly projectionNoticeDismissedFor: string | null;
}): ProjectionLoss | null {
	const views = plainEditableViews(
		state.workspace.panes.map((pane) => pane.view),
	);
	if (views.length === 0) return null;
	if (plainViewsSignature(views) === state.projectionNoticeDismissedFor) {
		return null;
	}
	return hasInlineContent(state.document) ? { views } : null;
}

// How long a plain confirmation stays before clearing itself.
export const NOTICE_AUTO_DISMISS_MS = 4000;

// A confirmation offering Undo stays longer, long enough to reach its button.
export const UNDO_NOTICE_DISMISS_MS = 8000;

// One rule for what may expire unattended: a plain confirmation, or one whose
// only action is an Undo that Mod+Z also reaches. A failure, or an instruction
// the user still has to act on, that disappeared would not be a recovery path.
export function autoDismissDelay(notice: AppNotice): number | null {
	if (notice.severity !== "info") return null;
	if (notice.actions.length === 0) return NOTICE_AUTO_DISMISS_MS;
	return notice.actions.every((action) => action.undo)
		? UNDO_NOTICE_DISMISS_MS
		: null;
}

// Which queued notice may still offer Undo: the one naming the document on
// screen. At most one can, because every command changes the document.
export function undoableNoticeId(state: {
	readonly document: TableDocument;
	readonly notices: readonly TransientNotice[];
}): string | null {
	return (
		state.notices.find((notice) => notice.undoFor === state.document)?.id ??
		null
	);
}

// What assistive technology should hear. The detail belongs to the message it
// qualifies, so the two are announced as one sentence pair.
export function announcementText(notice: AppNotice): string {
	return notice.detail ? `${notice.message} ${notice.detail}` : notice.message;
}

export function appNotices(sources: NoticeSources): readonly AppNotice[] {
	return [
		...projectedNotices(sources),
		...sources.notices.map(
			({ undoFor: _undoFor, ...notice }): AppNotice => ({
				...notice,
				actions:
					notice.id === sources.undoableNoticeId ? [undoAction(notice.id)] : [],
				dismissible: true,
			}),
		),
	];
}

function projectedNotices(sources: NoticeSources): readonly AppNotice[] {
	const projected: AppNotice[] = [];

	const storage = storageNotice(sources.storageIssue);
	if (storage) projected.push(storage);

	const preferences = preferencesNotice(sources.preferencesIssue);
	if (preferences) projected.push(preferences);

	if (sources.inputError) {
		// An import that was refused leaves the user looking at a table that is
		// not the one they just chose, so it interrupts.
		projected.push({
			id: conditionNoticeIds.inputError,
			severity: "error",
			urgency: "assertive",
			message: copy.notices.importError(sources.inputError),
			detail: copy.notices.importUnchanged,
			actions: [],
			dismissible: true,
		});
	}

	const warnings = sources.importWarnings ?? [];
	if (warnings.length > 0) {
		// The table arrived, with its text, but something in it was not kept:
		// the user is told what, never left to find it missing.
		projected.push({
			id: conditionNoticeIds.importWarnings,
			severity: "warning",
			urgency: "polite",
			message: copy.notices.importWarnings,
			detail: [...new Set(warnings.map(copy.source.issue))].join(" "),
			actions: [],
			dismissible: true,
		});
	}

	const pending = sources.pendingPaneAction;
	if (pending) {
		projected.push({
			id: conditionNoticeIds.pendingPaneAction,
			severity: "warning",
			urgency: "polite",
			message: copy.notices.pendingPaneAction(pending.kind),
			actions: [
				{
					id: "confirm-pane-action",
					label: copy.notices.discardPaneAction(pending.kind),
					run: () => useTabeloStore.getState().confirmPaneAction(),
				},
			],
			dismissible: true,
		});
	}

	if (sources.projectionLoss) {
		// A disclosure, not a failure: nothing has been lost, and nothing will
		// be unless a cell is edited there. It stays until dismissed, because
		// it describes the workspace for as long as the workspace is like this.
		projected.push({
			id: conditionNoticeIds.projectionLoss,
			severity: "warning",
			urgency: "polite",
			message: copy.notices.plainProjection(
				sources.projectionLoss.views.map((view) => view.label),
			),
			detail: copy.notices.plainProjectionDetail,
			actions: [],
			dismissible: true,
		});
	}

	if (sources.fillSeriesOffer) {
		// A question, not a problem: the fill already did what it was asked to.
		// Info severity and a polite announcement keep it out of the way of the
		// work, and its two actions stop it expiring unanswered.
		projected.push({
			id: conditionNoticeIds.fillSeries,
			severity: "info",
			urgency: "polite",
			message: copy.notices.fillSeriesOffer,
			actions: [
				{
					id: "fill-series",
					label: copy.notices.fillSeries,
					run: applyFillSeries,
				},
				{
					id: "keep-copied-values",
					label: copy.notices.keepCopiedValues,
					run: () => useTabeloStore.getState().dismissFillSeriesOffer(),
				},
			],
			dismissible: true,
		});
	}

	return projected;
}

// The document-level undo Mod+Z runs from the grid. The offer exists only
// while the command's result is still the document, so the step it undoes is
// the command itself. The notice goes with it: its message is no longer true.
function undoAction(noticeId: string): NoticeAction {
	return {
		id: "undo-command",
		label: copy.actions.undo,
		undo: true,
		run: () => {
			const store = useTabeloStore.getState();
			store.dismissNotice(noticeId);
			store.undo();
		},
	};
}

// Choosing the series is a second document operation, so it can find that the
// table moved on since the offer was made. It says so and changes nothing,
// rather than writing part of a sequence into cells that no longer match.
function applyFillSeries(): void {
	const store = useTabeloStore.getState();
	const outcome = store.applyFillSeries();
	if (!outcome.ok) {
		store.pushNotice({
			severity: "warning",
			message: copy.notices.fillSeriesUnavailable(outcome.refusal),
		});
		return;
	}
	store.announceStatus(copy.status.seriesFilled(outcome.count));
}

function storageNotice(issue: StorageIssue | null): AppNotice | null {
	if (!issue) return null;

	// Storage failures are not dismissible: the table really is at risk until
	// the user does something about it, and hiding the warning would not change
	// that. They interrupt for the same reason.
	const base = {
		id: conditionNoticeIds.storage,
		severity: "error",
		urgency: "assertive",
		dismissible: false,
	} as const;

	if (issue.kind === "unreadable") {
		return {
			...base,
			message: copy.notices.savedTableUnreadable[issue.reason],
			detail:
				recoveryFailure(issue.replacementFailure) ??
				copy.notices.recoveryFileNote,
			actions: unreadableActions({
				downloadId: "download-original",
				replaceId: "replace-saved-data",
				filename: RECOVERY_FILENAME,
				raw: issue.raw,
				replaceLabel: copy.notices.replaceSavedData,
				replace: replaceSavedData,
			}),
		};
	}

	return {
		...base,
		message:
			issue.kind === "unavailable"
				? copy.notices.storageUnavailable
				: copy.notices.storageQuota,
		actions: [
			{
				id: "download-copy",
				label: copy.notices.downloadCopy,
				run: downloadCurrentTable,
			},
		],
	};
}

const RECOVERY_FILENAME = "tabelo-recovery.json";
const SETTINGS_RECOVERY_FILENAME = "tabelo-settings-recovery.json";

// The two ways out of any unreadable payload, table or settings: keep the
// original by hand, or replace it after it has been copied aside.
function unreadableActions({
	downloadId,
	replaceId,
	filename,
	raw,
	replaceLabel,
	replace,
}: {
	readonly downloadId: string;
	readonly replaceId: string;
	readonly filename: string;
	readonly raw: string;
	readonly replaceLabel: string;
	readonly replace: () => void;
}): readonly NoticeAction[] {
	return [
		{
			id: downloadId,
			label: copy.notices.downloadOriginal,
			// The saved data exactly as it was found, never reserialized, so the
			// file is evidence as well as a way back. Its envelope is JSON, so it
			// is named and typed as JSON even when the bytes no longer parse,
			// which is itself one of the reasons it is here.
			run: () => downloadText(filename, "application/json", raw),
		},
		{ id: replaceId, label: replaceLabel, run: replace },
	];
}

// Unreadable settings put nothing in the table at risk: the app runs on the
// defaults and the stored bytes stay untouched. It is a warning that does not
// interrupt, and it stays until the user replaces them, like the table's.
function preferencesNotice(issue: PreferencesIssue | null): AppNotice | null {
	if (!issue) return null;
	return {
		id: conditionNoticeIds.preferencesStorage,
		severity: "warning",
		urgency: "polite",
		dismissible: false,
		message: copy.notices.savedSettingsUnreadable[issue.reason],
		detail:
			recoveryFailure(issue.replacementFailure) ??
			copy.notices.settingsRecoveryFileNote,
		actions: unreadableActions({
			downloadId: "download-original-settings",
			replaceId: "replace-saved-settings",
			filename: SETTINGS_RECOVERY_FILENAME,
			raw: issue.raw,
			replaceLabel: copy.notices.replaceSavedSettings,
			replace: replaceSavedSettings,
		}),
	};
}

function replaceSavedSettings(): void {
	const outcome = preferencesStore.replaceUnreadable();
	if (outcome.status === "failed") return;
	useTabeloStore
		.getState()
		.pushNotice(
			outcome.status === "saved"
				? { severity: "info", message: copy.notices.replacedSavedSettings }
				: { severity: "warning", message: copy.settings.saveError },
		);
}

function recoveryFailure(
	failure: "unavailable" | "quota" | undefined,
): string | undefined {
	if (failure === "unavailable") return copy.notices.storageRecoveryUnavailable;
	if (failure === "quota") return copy.notices.storageRecoveryQuota;
	return undefined;
}

function replaceSavedData(): void {
	const store = useTabeloStore.getState();
	if (!store.replaceUnreadableStorage()) return;
	store.pushNotice({
		severity: "info",
		message: copy.notices.replacedSavedData,
	});
}

function downloadCurrentTable(): void {
	const codec = getCodec("markdown");
	const state = useTabeloStore.getState();
	downloadText(
		tableDownloadFilename(state.name, codec.extension),
		codec.mimeType,
		codec.serialize(state.document, codecSpelling(codec)),
	);
}
