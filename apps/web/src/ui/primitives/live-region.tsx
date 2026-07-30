import { useEffect, useRef, useState } from "react";
import type { NoticeUrgency } from "@/state/notice-queue";

// A live region inserted into the page at the same moment as its text is not
// reliably announced: assistive technology has to already be watching the
// region when the text arrives. So both regions are mounted for the lifetime
// of the app, start empty, and are written into rather than created.
//
// They are the only announcement channel for notices. The visible notice bar
// carries no live semantics of its own, which is what keeps dismissing one
// notice from reading the remaining ones out again.
// See docs/design-system.md §4.

export interface Announcement {
	readonly id: string;
	readonly message: string;
	readonly urgency: NoticeUrgency;
}

export function LiveRegions({
	announcements,
}: {
	readonly announcements: readonly Announcement[];
}) {
	const [polite, setPolite] = useState("");
	const [assertive, setAssertive] = useState("");
	const announced = useRef<ReadonlySet<string>>(new Set());

	useEffect(() => {
		const fresh = announcements.filter(
			(announcement) => !announced.current.has(announcement.id),
		);
		announced.current = new Set(
			announcements.map((announcement) => announcement.id),
		);

		// Back to silence once nothing is outstanding, so that the same message
		// later is a change in the text rather than the identical string again.
		if (announcements.length === 0) {
			setPolite("");
			setAssertive("");
			return;
		}

		// Only what has not been said yet: removing a notice must not re-read the
		// ones that stayed. Writing the whole batch at once is also what keeps
		// several notices arriving together from becoming a burst of speech.
		if (fresh.length === 0) return;
		setPolite(textFor(fresh, "polite"));
		setAssertive(textFor(fresh, "assertive"));
	}, [announcements]);

	return (
		<>
			<div role="status" className="sr-only">
				{polite}
			</div>
			<div role="alert" className="sr-only">
				{assertive}
			</div>
		</>
	);
}

function textFor(
	announcements: readonly Announcement[],
	urgency: NoticeUrgency,
): string {
	return announcements
		.filter((announcement) => announcement.urgency === urgency)
		.map((announcement) => announcement.message)
		.join(" ");
}
