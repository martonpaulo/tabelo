import { copy } from "@/copy/copy";
import type { FillSeriesOffer } from "@/core/series";
import { getCodec } from "@/formats";
import type { ImportError } from "@/import/prepare";
import { downloadText, tableDownloadFilename } from "@/platform/files";
import {
	conditionNoticeIds,
	type NoticeSeverity,
	type NoticeUrgency,
	type TransientNotice,
} from "@/state/notice-queue";
import type { PendingPaneAction, StorageIssue } from "@/state/store";
import { useTabeloStore } from "@/state/store";

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
	readonly inputError: ImportError | null;
	readonly pendingPaneAction: PendingPaneAction | null;
	readonly fillSeriesOffer: FillSeriesOffer | null;
	readonly notices: readonly TransientNotice[];
}

// How long a plain confirmation stays before clearing itself.
export const NOTICE_AUTO_DISMISS_MS = 4000;

// One rule for what may expire unattended: a plain confirmation, and nothing
// else. A failure, or an instruction the user still has to act on, that
// disappeared after four seconds would not be a recovery path.
export function autoDismissDelay(notice: AppNotice): number | null {
	return notice.severity === "info" && notice.actions.length === 0
		? NOTICE_AUTO_DISMISS_MS
		: null;
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
			(notice): AppNotice => ({ ...notice, actions: [], dismissible: true }),
		),
	];
}

function projectedNotices(sources: NoticeSources): readonly AppNotice[] {
	const projected: AppNotice[] = [];

	const storage = storageNotice(sources.storageIssue);
	if (storage) projected.push(storage);

	if (sources.inputError) {
		// An import that was refused leaves the user looking at a table that is
		// not the one they just chose, so it interrupts.
		projected.push({
			id: conditionNoticeIds.inputError,
			severity: "error",
			urgency: "assertive",
			message: copy.notices.importError(sources.inputError),
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
			message: copy.notices.savedTableUnreadable,
			detail: recoveryFailure(issue.replacementFailure),
			actions: [
				{
					id: "download-original",
					label: copy.notices.downloadOriginal,
					run: () =>
						downloadText("tabelo-recovery.txt", "text/plain", issue.raw),
				},
				{
					id: "replace-saved-data",
					label: copy.notices.replaceSavedData,
					run: replaceSavedData,
				},
			],
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
		codec.serialize(state.document),
	);
}
