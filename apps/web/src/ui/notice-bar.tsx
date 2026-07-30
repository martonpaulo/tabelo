import { Button } from "@tabelo/ui/components/button";
import { X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { useSelectionAnnouncement } from "@/ui/grid/use-selection-announcement";
import {
	type AppNotice,
	announcementText,
	appNotices,
	autoDismissDelay,
} from "@/ui/notices";
import { LiveRegions } from "@/ui/primitives/live-region";
import { Notice } from "@/ui/primitives/notice";

// Notices sit in the layout rather than floating over it. A toast that covered
// the table would be exactly the kind of interruption this product avoids.
// See docs/design-system.md §5.
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
					className="flex shrink-0 flex-col gap-2 px-3 py-2"
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
	const headerCorrection = useTabeloStore((state) => state.headerCorrection);
	const pendingPaneAction = useTabeloStore((state) => state.pendingPaneAction);
	const notices = useTabeloStore((state) => state.notices);

	return useMemo(
		() =>
			appNotices({
				storageIssue,
				inputError,
				headerCorrection,
				pendingPaneAction,
				notices,
			}),
		[storageIssue, inputError, headerCorrection, pendingPaneAction, notices],
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
		<Notice severity={notice.severity} className="shrink-0">
			<span>{notice.message}</span>
			{notice.detail ? (
				<span className="text-muted-foreground">{notice.detail}</span>
			) : null}
			{notice.actions.map((action) => (
				<Button
					key={action.id}
					variant="outline"
					size="xs"
					onClick={action.run}
				>
					{action.label}
				</Button>
			))}
			{notice.dismissible ? (
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={copy.actions.dismiss}
					className="ml-auto"
					onClick={() => useTabeloStore.getState().dismissNotice(id)}
				>
					<X aria-hidden />
				</Button>
			) : null}
		</Notice>
	);
}
