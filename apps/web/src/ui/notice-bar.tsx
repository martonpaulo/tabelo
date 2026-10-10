import { Button } from "@tabelo/ui/components/button";
import { IconX } from "@tabler/icons-react";
import {
	type FocusEvent as ReactFocusEvent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { copy } from "@/copy/copy";
import { usePreferencesIssue } from "@/preferences/use-preferences";
import { useTabeloStore } from "@/state/store";
import { useSelectionAnnouncement } from "@/ui/grid/use-selection-announcement";
import {
	type AppNotice,
	announcementText,
	appNotices,
	autoDismissDelay,
	type ProjectionLoss,
	projectionLossOf,
	undoableNoticeId,
} from "@/ui/notices";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { LiveRegions } from "@/ui/primitives/live-region";
import { Notice } from "@/ui/primitives/notice";
import { useNoticeExpiry } from "@/ui/use-notice-expiry";
import { plainViewsSignature } from "@/views/projection-loss";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";

// Notices float over the workspace in their own layer. Standing in the layout
// was the interruption: an idle notice area renders nothing, so the first
// notice inserted a band and pushed every pane down, which is the reflow
// docs/design-system/5-layout.md forbids. Floating is still not a dialog: nothing is
// trapped, and only the notices themselves take pointer events, so the work
// underneath stays reachable. See docs/design-system/5-layout.md.
//
// Every notice the app has to give is rendered. Ranking them and showing only
// the winner is what used to swallow a refused clipboard write whenever
// anything else was on screen.

export function NoticeBar() {
	const notices = useAppNotices();
	// The grid's selection extent is polite text with no visible counterpart, so
	// it joins the notices at the one place that owns the live regions rather
	// than mounting a region of its own next to the grid. The same is true of
	// every other polite status the app produces.
	const selectionExtent = useSelectionAnnouncement();
	const politeStatus = useTabeloStore((state) => state.politeStatus);
	const announcements = useMemo(
		() => [
			...notices.map((notice) => ({
				id: notice.id,
				urgency: notice.urgency,
				message: announcementText(notice),
			})),
			...(politeStatus
				? [{ ...politeStatus, urgency: "polite" as const }]
				: []),
		],
		[politeStatus, notices],
	);
	const focusReturn = useNoticeFocusReturn();

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
					{...focusReturn}
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

// Where focus goes when a render removes the notice control that held it:
// dismissing, choosing Undo, or an Undo withdrawn because the document changed
// (#450). Left alone, the browser drops focus to the page and a keyboard user
// has to find their way back from the top. It returns to where it came from
// when that is still there; after a whole-table Undo the grid redraws its
// cells, so the cell at the same address stands in; failing both, the next
// notice keeps the user where they were. A user who moved focus elsewhere
// on purpose is never pulled back.
function useNoticeFocusReturn() {
	const bar = useRef<HTMLElement>(null);
	const origin = useRef<HTMLElement | null>(null);
	const held = useRef<HTMLElement | null>(null);

	// After every render, because any render can remove the control: it costs
	// one property read when nothing in the bar holds focus.
	useLayoutEffect(() => {
		const control = held.current;
		if (!control || control.isConnected) return;
		held.current = null;
		const active = document.activeElement;
		if (active && active !== document.body) return;
		focusReturnTarget(origin.current, bar.current)?.focus();
	});

	return {
		ref: bar,
		onFocus: (event: ReactFocusEvent<HTMLElement>) => {
			held.current = event.target;
			const from = event.relatedTarget;
			if (from instanceof HTMLElement && !event.currentTarget.contains(from)) {
				origin.current = from;
			}
		},
		onBlur: (event: ReactFocusEvent<HTMLElement>) => {
			const to = event.relatedTarget;
			if (to && !event.currentTarget.contains(to)) held.current = null;
		},
	};
}

function focusReturnTarget(
	origin: HTMLElement | null,
	bar: HTMLElement | null,
): HTMLElement | null {
	if (origin?.isConnected) return origin;
	const cell = origin?.dataset.cell;
	const sameCell = cell
		? window.document.querySelector<HTMLElement>(`[data-cell="${cell}"]`)
		: null;
	return sameCell ?? bar?.querySelector<HTMLElement>("button") ?? null;
}

function useAppNotices(): readonly AppNotice[] {
	const storageIssue = useTabeloStore((state) => state.storageIssue);
	const preferencesIssue = usePreferencesIssue();
	const inputError = useTabeloStore((state) => state.inputError);
	const importWarnings = useTabeloStore((state) => state.importWarnings);
	const pendingPaneAction = useTabeloStore((state) => state.pendingPaneAction);
	const fillSeriesOffer = useTabeloStore((state) => state.fillSeriesOffer);
	const notices = useTabeloStore((state) => state.notices);
	const projectionLoss = useProjectionLoss();
	// An identifier, not the document, so typing does not re-render the bar.
	const undoable = useTabeloStore(undoableNoticeId);

	return useMemo(
		() =>
			appNotices({
				storageIssue,
				preferencesIssue,
				inputError,
				importWarnings,
				pendingPaneAction,
				fillSeriesOffer,
				notices,
				projectionLoss,
				undoableNoticeId: undoable,
			}),
		[
			storageIssue,
			preferencesIssue,
			inputError,
			importWarnings,
			pendingPaneAction,
			fillSeriesOffer,
			notices,
			projectionLoss,
			undoable,
		],
	);
}

// Read as a string so the notice bar re-renders only when the condition itself
// changes, not on every keystroke that edits the document.
function useProjectionLoss(): ProjectionLoss | null {
	const signature = useTabeloStore((state) => {
		const loss = projectionLossOf(state);
		return loss ? plainViewsSignature(loss.views) : null;
	});
	return useMemo(
		() =>
			signature === null
				? null
				: {
						views: signature.split(",").map((id) => getView(id as ViewId)),
					},
		[signature],
	);
}

function NoticeRow({ notice }: { readonly notice: AppNotice }) {
	const { id } = notice;
	const row = useRef<HTMLDivElement>(null);
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);

	// Read from the element as well as from events. A notice that mounts under
	// a resting pointer gets no pointerenter, and a focused action removed by a
	// render (an Undo withdrawn when the document changed) gets no reliable
	// focusout; either would leave the countdown in the wrong state.
	useLayoutEffect(() => {
		setHovered(row.current?.matches(":hover") ?? false);
	}, []);
	useLayoutEffect(() => {
		setFocused(row.current?.contains(document.activeElement) ?? false);
	});
	// Listened to natively: they observe attention and make nothing
	// interactive, so the row stays a plain container to assistive technology.
	useEffect(() => {
		const element = row.current;
		if (!element) return;
		const enter = () => setHovered(true);
		const leave = () => setHovered(false);
		const focusIn = () => setFocused(true);
		const focusOut = (event: FocusEvent) =>
			setFocused(
				event.relatedTarget instanceof Node &&
					element.contains(event.relatedTarget),
			);
		element.addEventListener("pointerenter", enter);
		element.addEventListener("pointerleave", leave);
		element.addEventListener("focusin", focusIn);
		element.addEventListener("focusout", focusOut);
		return () => {
			element.removeEventListener("pointerenter", enter);
			element.removeEventListener("pointerleave", leave);
			element.removeEventListener("focusin", focusIn);
			element.removeEventListener("focusout", focusOut);
		};
	}, []);

	// The timer belongs to the notice that is on screen. The one this replaced
	// sat above the precedence chain, so a message that was never rendered
	// expired anyway and the user never saw it.
	useNoticeExpiry(id, autoDismissDelay(notice), hovered || focused);

	return (
		<div
			ref={row}
			// Only as wide as it needs to be, up to the cap: a short message must
			// not draw a band across the table just because a long one could.
			className="pointer-events-auto w-fit max-w-sm shrink-0"
		>
			<Notice floating severity={notice.severity}>
				{/* One anatomy for every notice: dismissal holds the top trailing
			    corner, and the message and its actions share the column beside
			    it, so an action never runs under the dismissal and nothing moves
			    with the message length. */}
				<div data-notice-id={id} className="flex w-full items-start gap-2">
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<span className="font-medium">{notice.message}</span>
						{notice.detail ? (
							<span className="text-muted-foreground text-xs">
								{notice.detail}
							</span>
						) : null}
						{notice.actions.length > 0 ? (
							// A notice's action is the quiet way out of a condition, drawn as
							// the neutral secondary button under the message, never in the
							// accent this product spends on focus and selection.
							<div className="mt-1 flex flex-wrap gap-1">
								{notice.actions.map((action) => (
									<Button
										key={action.id}
										variant="secondary"
										size="xs"
										onClick={action.run}
									>
										{action.label}
									</Button>
								))}
							</div>
						) : null}
					</div>
					{notice.dismissible ? (
						<span className="flex h-5 shrink-0 items-center">
							<ControlTooltip name={copy.actions.dismiss}>
								<Button
									variant="ghost"
									size="icon-xs"
									// Centred on the first line of text, overflowing it evenly, so
									// the notice is as tall as its message, not its close button.
									className="-mr-1 shrink-0"
									onClick={() => useTabeloStore.getState().dismissNotice(id)}
								>
									<IconX aria-hidden />
								</Button>
							</ControlTooltip>
						</span>
					) : null}
				</div>
			</Notice>
		</div>
	);
}
