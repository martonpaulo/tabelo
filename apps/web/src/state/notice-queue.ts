// The transient half of the notice channel: things that happened once and the
// user should be told about. They queue rather than replace each other,
// because a single slot meant a refused clipboard write was discarded whenever
// anything else happened to be on screen.
//
// Conditions such as a storage failure are not queued here. They are state
// that lasts until it is resolved, and are projected into the notice list
// instead: see ui/notices.ts.

// What the message means. Tone, announcement, and whether the notice may
// expire all follow from this rather than from which producer raised it.
export type NoticeSeverity = "info" | "warning" | "error";

// Which live region carries the announcement. Assertive interrupts whatever
// assistive technology is currently saying, so it is reserved for the cases
// that put the user's table at risk. See docs/design-system.md §4.
export type NoticeUrgency = "polite" | "assertive";

export interface TransientNotice {
	readonly id: string;
	readonly severity: NoticeSeverity;
	readonly urgency: NoticeUrgency;
	readonly message: string;
}

export interface NoticeRequest {
	readonly severity: NoticeSeverity;
	readonly message: string;
	readonly urgency?: NoticeUrgency;
}

// A projected condition is addressed by a fixed identifier so that dismissing
// it clears the state that produced it rather than removing a queue entry.
export const conditionNoticeIds = {
	storage: "condition-storage",
	inputError: "condition-input-error",
	headerCorrection: "condition-header-correction",
	pendingPaneAction: "condition-pending-pane-action",
} as const;

// Enough to hold a burst, such as a refused copy followed by a refused paste,
// without letting the queue push the workspace off the screen.
export const TRANSIENT_NOTICE_LIMIT = 3;

let sequence = 0;

export function queueNotice(
	queue: readonly TransientNotice[],
	request: NoticeRequest,
): readonly TransientNotice[] {
	sequence += 1;
	const notice: TransientNotice = {
		id: `notice-${sequence}`,
		severity: request.severity,
		urgency: request.urgency ?? "polite",
		message: request.message,
	};

	// Repeating an action that says the same thing refreshes what it already
	// said. Two identical bars would add nothing, and the fresh identifier is
	// what restarts a confirmation's own dismissal.
	const repeated = queue.findIndex(
		(candidate) =>
			candidate.message === notice.message &&
			candidate.severity === notice.severity,
	);
	if (repeated !== -1) {
		return queue.map((candidate, index) =>
			index === repeated ? notice : candidate,
		);
	}

	const next = [...queue, notice];
	return next.length > TRANSIENT_NOTICE_LIMIT
		? next.slice(next.length - TRANSIENT_NOTICE_LIMIT)
		: next;
}

export function removeNotice(
	queue: readonly TransientNotice[],
	id: string,
): readonly TransientNotice[] {
	return queue.some((candidate) => candidate.id === id)
		? queue.filter((candidate) => candidate.id !== id)
		: queue;
}
