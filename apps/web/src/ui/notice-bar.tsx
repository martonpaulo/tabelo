import { Button } from "@tabelo/ui/components/button";
import { X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import { useSelectionAnnouncement } from "@/ui/grid/use-selection-announcement";
import {
	type AppNotice,
	announcementText,
	appNotices,
	autoDismissDelay,
} from "@/ui/notices";
import { LiveRegions } from "@/ui/primitives/live-region";
import { Notice } from "@/ui/primitives/notice";

// Notices float over the workspace in their own layer. Standing in the layout
// was the interruption: an idle notice area renders nothing, so the first
// notice inserted a band and pushed every pane down, which is the reflow
// docs/design-system.md §5 forbids. Floating is still not a dialog: nothing is
// trapped, and only the notices themselves take pointer events, so the work
// underneath stays reachable. See docs/design-system.md §5.
//
// Every notice the app has to give is rendered. Ranking them and showing only
// the winner is what used to swallow a refused clipboard write whenever
// anything else was on screen.

export function NoticeBar() {
	const notices = useAppNotices();
	// The grid's selection extent is polite text with no visible counterpart, so
	// it joins the notices at the one place that owns the live regions rather
	// than mounting a region of its own next to the grid.
	const selectionExtent = useSelectionAnnouncement();
	const announcements = useMemo(
		() =>
			notices.map((notice) => ({
				id: notice.id,
				urgency: notice.urgency,
				message: announcementText(notice),
			})),
		[notices],
	);

	return (
		<>
			{notices.length > 0 ? (
				<section
					aria-label={copy.a11y.notices}
					// Fixed to the viewport rather than to the workspace: the panes
					// must not move when a notice appears, and a stacked workspace
					// scrolls underneath instead of carrying the notice off screen.
					// Pinned to the top trailing corner, the one the floating action
					// button does not own, on the panes' own 0.5rem inset. A notice
					// covers the pane header it lands on, including that pane's
					// actions trigger: dismissal frees it, and until then the trigger
					// stays reachable from the keyboard, which is where a covered
					// control has to remain reachable.
					className="pointer-events-none fixed inset-x-0 top-0 z-(--z-notice) flex flex-col items-end gap-2 p-2"
				>
					{notices.map((notice) => (
						<NoticeRow key={notice.id} notice={notice} />
					))}
				</section>
			) : null}
			<LiveRegions announcements={announcements} status={selectionExtent} />
		</>
	);
}

function useAppNotices(): readonly AppNotice[] {
	const storageIssue = useTabeloStore((state) => state.storageIssue);
	const inputError = useTabeloStore((state) => state.inputError);
	const pendingPaneAction = useTabeloStore((state) => state.pendingPaneAction);
	const notices = useTabeloStore((state) => state.notices);

	return useMemo(
		() =>
			appNotices({
				storageIssue,
				inputError,
				pendingPaneAction,
				notices,
			}),
		[storageIssue, inputError, pendingPaneAction, notices],
	);
}

function NoticeRow({ notice }: { readonly notice: AppNotice }) {
	const { id } = notice;
	const delay = autoDismissDelay(notice);

	// The timer belongs to the notice that is on screen. The one this replaced
	// sat above the precedence chain, so a message that was never rendered
	// expired anyway and the user never saw it.
	useEffect(() => {
		if (delay === null) return;
		const timer = setTimeout(
			() => useTabeloStore.getState().dismissNotice(id),
			delay,
		);
		return () => clearTimeout(timer);
	}, [id, delay]);

	return (
		<Notice
			floating
			severity={notice.severity}
			// Only as wide as it needs to be, up to the cap: a short message must
			// not draw a band across the table just because a long one could.
			className="pointer-events-auto w-fit max-w-sm shrink-0"
		>
			{/* One anatomy for every notice: dismissal holds the top trailing
			    corner, and the message and its actions share the column beside
			    it, so an action never runs under the dismissal and nothing moves
			    with the message length. */}
			<div className="flex w-full items-start gap-2">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span>
						{notice.message}
						{notice.detail ? (
							<span className="text-muted-foreground"> {notice.detail}</span>
						) : null}
					</span>
					{notice.actions.length > 0 ? (
						// A notice's action is the quiet way out of a condition, not a
						// decision the surface is asking for, so it stays a tertiary
						// control with no outline. Weight, not colour, is what separates
						// it from the message: notification guidance puts the action in
						// the body-strong style, and blue here would compete with the
						// one accent this product spends on focus and selection. No
						// capitals and no italics: both cost legibility for the readers
						// who can least afford it.
						<div className="flex flex-wrap justify-end gap-1">
							{notice.actions.map((action) => (
								<Button
									key={action.id}
									variant="ghost"
									size="xs"
									className="font-semibold"
									onClick={action.run}
								>
									{action.label}
								</Button>
							))}
						</div>
					) : null}
				</div>
				{notice.dismissible ? (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={copy.actions.dismiss}
						className="shrink-0"
						onClick={() => useTabeloStore.getState().dismissNotice(id)}
					>
						<X aria-hidden />
					</Button>
				) : null}
			</div>
		</Notice>
	);
}
