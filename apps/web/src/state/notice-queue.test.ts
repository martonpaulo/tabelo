import { describe, expect, it } from "vitest";
import {
	type NoticeRequest,
	queueNotice,
	removeNotice,
	TRANSIENT_NOTICE_LIMIT,
	type TransientNotice,
} from "./notice-queue";

// The queue exists because a single slot dropped whatever it was not showing.
// What matters here is that pushing never destroys an earlier message and that
// removal targets one entry rather than whichever ranks highest.

const failure: NoticeRequest = { severity: "error", message: "It failed." };
const confirmation: NoticeRequest = { severity: "info", message: "It worked." };

function push(
	queue: readonly TransientNotice[],
	...requests: readonly NoticeRequest[]
): readonly TransientNotice[] {
	return requests.reduce(queueNotice, queue);
}

function messages(queue: readonly TransientNotice[]): readonly string[] {
	return queue.map((notice) => notice.message);
}

describe("queueing", () => {
	it("keeps an earlier message when a later one arrives", () => {
		const queue = push([], failure, confirmation);

		expect(messages(queue)).toEqual([failure.message, confirmation.message]);
	});

	it("defaults to a polite announcement", () => {
		expect(push([], failure)[0]?.urgency).toBe("polite");
		expect(push([], { ...failure, urgency: "assertive" })[0]?.urgency).toBe(
			"assertive",
		);
	});

	it("gives every entry its own identifier", () => {
		const queue = push([], failure, confirmation);

		expect(new Set(queue.map((notice) => notice.id)).size).toBe(queue.length);
	});

	it("refreshes a repeated message in place instead of stacking it", () => {
		const first = push([], confirmation);
		const repeated = push(first, confirmation);

		expect(messages(repeated)).toEqual([confirmation.message]);
		// A new identifier is what restarts the confirmation's own dismissal.
		expect(repeated[0]?.id).not.toBe(first[0]?.id);
	});

	it("treats the same words at a different severity as a different message", () => {
		const queue = push([], confirmation, {
			...confirmation,
			severity: "error",
		});

		expect(queue).toHaveLength(2);
	});

	it("drops the oldest once the queue is full", () => {
		const queue = push(
			[],
			...Array.from({ length: TRANSIENT_NOTICE_LIMIT + 1 }, (_, index) => ({
				severity: "error" as const,
				message: `Failure ${index}.`,
			})),
		);

		expect(queue).toHaveLength(TRANSIENT_NOTICE_LIMIT);
		expect(messages(queue)).not.toContain("Failure 0.");
	});
});

describe("removal", () => {
	it("removes only the entry it names", () => {
		const queue = push([], failure, confirmation);
		const id = queue[0]?.id ?? "";

		expect(messages(removeNotice(queue, id))).toEqual([confirmation.message]);
	});

	it("leaves the queue untouched when nothing matches", () => {
		const queue = push([], failure);

		expect(removeNotice(queue, "absent")).toBe(queue);
	});
});
