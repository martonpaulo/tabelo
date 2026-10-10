import type { NoticeUrgency } from "@/state/notice-queue";

// What the live regions are asked to say, and the rule for what still has to
// be said. Kept apart from the regions themselves so the rule is plain data
// with no React in it.

export interface Announcement {
	readonly id: string;
	readonly message: string;
	readonly urgency: NoticeUrgency;
}

// What was last written for each identifier still outstanding.
export type AnnouncedRecord = ReadonlyMap<string, string>;

// An announcement still has to be said when its identifier is new, or when
// what it says has changed since it was last written. A condition keeps its
// identifier while its message, detail, or urgency changes (#449): comparing
// identifiers alone left the region reading out the previous condition while
// the notice on screen showed the new one. An unchanged survivor is never
// fresh, which is what keeps dismissing one notice from re-reading the rest.
export function freshAnnouncements(
	previous: AnnouncedRecord,
	announcements: readonly Announcement[],
): {
	readonly fresh: readonly Announcement[];
	readonly record: AnnouncedRecord;
} {
	const record = new Map(
		announcements.map((announcement) => [
			announcement.id,
			signature(announcement),
		]),
	);
	const fresh = announcements.filter(
		(announcement) => previous.get(announcement.id) !== signature(announcement),
	);
	return { fresh, record };
}

function signature(announcement: Announcement): string {
	return `${announcement.urgency}:${announcement.message}`;
}
