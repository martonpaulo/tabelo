import { disclosureTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { activePanelSurfaceStyles } from "@tabelo/ui/components/surface-styles";
import { cn } from "@tabelo/ui/lib/utils";
import { IconPlus } from "@tabler/icons-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { Panel } from "@/ui/primitives/panel";
import type { OccurrenceSummary } from "@/ui/source/occurrence-selection";
import { getView } from "@/views/registry";
import {
	gridAreaStyle,
	type LayoutId,
	type SplitEdge,
	type SplitOption,
	type WorkspacePane,
} from "@/workspace/layout";
import { PaneFindBar } from "./find-bar";
import { PaneContent } from "./pane-content";
import { PaneErrorBoundary } from "./pane-error-boundary";
import { PaneIdentity, PaneMenu } from "./pane-menu";
import { PaneAssistanceContext } from "./use-pane-assistance";
import { PaneEntryContext, usePaneEntry } from "./use-pane-entry";
import {
	type FindSummary,
	type FindTarget,
	type PaneFind,
	PaneFindContext,
} from "./use-pane-find";
import { PaneOccurrencesContext } from "./use-pane-occurrences";

// One pane frame for every view. The header carries only what belongs to this
// pane: which view it shows and the state of that view. Document-level
// actions live in the floating app menu: see docs/design-system/5-layout.md.

interface PaneProps {
	readonly pane: WorkspacePane;
	readonly active: boolean;
	// With one pane there is no competing selection to identify. The pane still
	// owns focus and aria-current, but the persistent active edge would be noise.
	readonly showActiveIndicator: boolean;
	// Stacked, the pane takes the full width in reading order and must not name
	// a slot: an inline grid area pointing at column two would conjure that
	// column back into existence.
	readonly stacked: boolean;
	// Whether the floating action button rests over this pane's bottom trailing
	// corner, decided by the workspace from the layout, never from the view.
	readonly underFab: boolean;
	// The layout each of this pane's splits would reach, one per edge it can be
	// cut along. Both absent means this pane cannot be cut in half, which is
	// what makes the control disappear at four panes; both present is the
	// whole-grid pane of "single", which can be cut either way.
	//
	// Passed apart rather than as option objects, because this component is
	// memoized: a freshly derived object every render would defeat that and
	// re-render every pane on any workspace change, which is enough to unsettle
	// a menu that is open inside one.
	readonly splitBottom: LayoutId | undefined;
	readonly splitRight: LayoutId | undefined;
	readonly onSplit: (option: SplitOption) => void;
	readonly onChangeView: (
		paneId: string,
		opener: HTMLButtonElement | null,
	) => void;
	readonly onMovePane: (
		paneId: string,
		opener: HTMLButtonElement | null,
	) => void;
	// Set for the pane a split just created, so it says so once.
	readonly justAdded: boolean;
}

export const Pane = memo(function Pane({
	pane,
	active,
	showActiveIndicator,
	stacked,
	underFab,
	splitBottom,
	splitRight,
	onSplit,
	onChangeView,
	onMovePane,
	justAdded,
}: PaneProps) {
	const view = getView(pane.view);
	const ref = useRef<HTMLElement>(null);
	const entered = usePaneEntry(ref);

	const [announcement, setAnnouncement] = useState("");
	useEffect(() => {
		if (justAdded) setAnnouncement(copy.a11y.paneAdded(view.label));
		else if (entered) setAnnouncement(copy.a11y.enteredPane);
		else setAnnouncement("");
	}, [entered, justAdded, view.label]);

	// Published by whatever this pane is currently showing, and owned by nothing
	// else: the summary lives exactly as long as the content that reports it.
	const [occurrences, setOccurrences] = useState<OccurrenceSummary | null>(
		null,
	);

	// This pane's find (#280). The query is in the store; the surface that
	// searches this pane's own text registers itself here and reports its
	// count, both as local state that lives exactly as long as that surface.
	const [findTarget, setFindTarget] = useState<FindTarget | null>(null);
	const [findSummary, setFindSummary] = useState<FindSummary | null>(null);
	const [findFocusRequest, setFindFocusRequest] = useState(0);
	const paneFind = useMemo(
		(): PaneFind => ({
			open: () => {
				useTabeloStore.getState().openFind(pane.id);
				setFindFocusRequest((request) => request + 1);
			},
			report: setFindSummary,
			register: (target) => {
				setFindTarget(target);
				return () =>
					setFindTarget((current) => (current === target ? null : current));
			},
		}),
		[pane.id],
	);

	// The structural-assistance switch for this pane's current buffer (#297).
	// Local React state, so it is never persisted and a reload or the pane
	// closing starts it on again. It lasts while the same buffer is edited,
	// clean or invalid, and turns back on the moment that buffer is gone: the
	// view changes, the pane's draft is discarded or superseded, or text from
	// outside replaces what was being edited, which is also how a draft brought
	// back by document undo starts with it on.
	const [assistanceEnabled, setAssistanceEnabled] = useState(true);
	const enableAssistance = useCallback(() => setAssistanceEnabled(true), []);
	const ownsDraft = useTabeloStore((state) => state.draft?.paneId === pane.id);
	const heldDraft = useRef(ownsDraft);
	useEffect(() => {
		if (heldDraft.current && !ownsDraft) enableAssistance();
		heldDraft.current = ownsDraft;
	}, [ownsDraft, enableAssistance]);
	const servedView = useRef(pane.view);
	useEffect(() => {
		if (servedView.current === pane.view) return;
		servedView.current = pane.view;
		enableAssistance();
	}, [pane.view, enableAssistance]);
	const changeView = useCallback(
		(opener: HTMLButtonElement | null) => onChangeView(pane.id, opener),
		[onChangeView, pane.id],
	);

	const assistance = useMemo(
		() => ({ enabled: assistanceEnabled, onBufferReplaced: enableAssistance }),
		[assistanceEnabled, enableAssistance],
	);

	return (
		<PaneContexts entered={entered} find={paneFind}>
			<Panel
				ref={ref}
				data-pane-id={pane.id}
				aria-current={active ? "true" : undefined}
				aria-label={copy.workspace.pane(view.label)}
				aria-description={entered ? undefined : copy.a11y.paneInteractHint}
				style={
					{
						// The anchor this pane's edge bands are placed against.
						anchorName: paneAnchorName(pane.id),
						...(stacked ? {} : { gridArea: gridAreaStyle(pane.slots) }),
					} as React.CSSProperties
				}
				data-pane-active={active && showActiveIndicator ? "true" : undefined}
				data-under-fab={underFab ? "" : undefined}
				className={cn(
					"group/pane min-w-0",
					// The active edge replaces the resting border rather than being
					// drawn inside it: two strokes at slightly different radii is what
					// made the rounded corners look doubled and chewed. Same width in
					// both states, so activating a pane moves nothing.
					active && showActiveIndicator && activePanelSurfaceStyles,
					// Tall enough to be worth scrolling to, and still allowed to grow
					// when it is the only pane on screen.
					stacked && "min-h-pane-stack flex-1",
				)}
				onPointerDownCapture={() => {
					if (!active) useTabeloStore.getState().setActivePane(pane.id);
				}}
				onFocusCapture={() => {
					if (!active) useTabeloStore.getState().setActivePane(pane.id);
				}}
			>
				{/* Static identity and one command trigger share the row. The spacer
				    keeps the actions button right-aligned as the name shortens. */}
				<Panel.Header className="overflow-hidden">
					<PaneIdentity view={view} />
					<Panel.Spacer />
					{/* Passive state, not a third action: text with no role, no focus,
					    and nothing to press. It grows leftward into the spacer, so the
					    actions trigger never moves, and tabular figures keep the count
					    from resizing as it climbs. Secondary status detail, which is
					    what text-xs is reserved for: see docs/design-system/2-tokens.md. */}
					{occurrences ? (
						<span
							data-slot="pane-occurrences"
							className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums"
						>
							{copy.workspace.occurrencesSelected(
								occurrences.selected,
								occurrences.total,
							)}
						</span>
					) : null}
					<PaneMenu
						paneId={pane.id}
						view={view}
						onChangeView={changeView}
						onMovePane={(opener) => onMovePane(pane.id, opener)}
						assistanceEnabled={assistanceEnabled}
						onAssistanceChange={setAssistanceEnabled}
					/>
				</Panel.Header>

				{/* Content scale is published to the body and nowhere else, so a zoomed
			    pane keeps its header, controls, and focus targets at full size. */}
				<Panel.Body
					style={{ "--pane-zoom": pane.zoom } as React.CSSProperties}
					className={cn(
						// A column, so the find bar can be pushed to the foot of the
						// pane by the space the content does not use.
						"flex flex-col",
						view.kind === "grid" && "tabelo-grid-scroller",
						view.kind === "source" && "overflow-hidden",
						// Editable and read-only content share the one content box
						// surface (owner, 2026-09-19); the header's read-only badge
						// is what says a pane cannot be edited.
					)}
				>
					<PaneOccurrencesContext.Provider value={setOccurrences}>
						<PaneAssistanceContext.Provider value={assistance}>
							{/* Around the content only, so a view that fails leaves the
							    header, its Change view command, and the find bar working. */}
							<PaneErrorBoundary viewId={view.id} onChangeView={changeView}>
								{view.kind === "grid" ? (
									<PaneContent
										paneId={pane.id}
										view={view}
										zoom={pane.zoom}
										display={pane}
									/>
								) : (
									// A view that scrolls itself fills what the bar leaves, so
									// opening the bar shortens it rather than pushing the bar
									// out of the pane.
									<div className="min-h-0 flex-1">
										<PaneContent
											paneId={pane.id}
											view={view}
											zoom={pane.zoom}
											display={pane}
										/>
									</div>
								)}
							</PaneErrorBoundary>
						</PaneAssistanceContext.Provider>
					</PaneOccurrencesContext.Provider>
					{/* Inside the pane body rather than below it, so for the grid,
					    whose body is the scroller, the pane's own horizontal scrollbar
					    stays at the very bottom edge instead of running between the
					    table and the bar. It sticks to both the bottom and the leading
					    edge, so it neither scrolls away nor slides sideways with the
					    table. Every pane has one (#280), and it renders nothing until
					    this pane's find state exists. */}
					<PaneFindBar
						paneId={pane.id}
						view={view}
						target={findTarget}
						summary={findSummary}
						focusRequest={findFocusRequest}
					/>
				</Panel.Body>

				{splitRight ? (
					<SplitControl
						edge="right"
						onSplit={() =>
							onSplit({ paneId: pane.id, edge: "right", layout: splitRight })
						}
						view={view.label}
						anchor={paneAnchorName(pane.id)}
					/>
				) : null}
				{splitBottom ? (
					<SplitControl
						edge="bottom"
						onSplit={() =>
							onSplit({ paneId: pane.id, edge: "bottom", layout: splitBottom })
						}
						view={view.label}
						anchor={paneAnchorName(pane.id)}
					/>
				) : null}

				<div role="status" className="sr-only">
					{announcement}
				</div>
			</Panel>
		</PaneContexts>
	);
});

// The contexts a pane publishes to what it holds: whether the keyboard has
// entered it, and its find (#280).
function PaneContexts({
	entered,
	find,
	children,
}: {
	readonly entered: boolean;
	readonly find: PaneFind;
	readonly children: React.ReactNode;
}) {
	return (
		<PaneEntryContext.Provider value={entered}>
			<PaneFindContext.Provider value={find}>
				{children}
			</PaneFindContext.Provider>
		</PaneEntryContext.Provider>
	);
}

// The name a pane publishes as a CSS anchor, so its edge bands can be placed
// against it. A dashed ident allows only name characters, and a stored pane id
// is any non-empty string, so every other character is spelled out.
// https://developer.mozilla.org/en-US/docs/Web/CSS/anchor-name
function paneAnchorName(paneId: string): string {
	return `--tabelo-pane-${paneId.replace(/[^A-Za-z0-9_-]/g, (char) => `_${char.codePointAt(0)}_`)}`;
}

// How far the band reaches to each side of the pane's outer edge: across the
// pane's own frame margin, which ends where the content box and its scrollbar
// begin, and across the workspace's padding beyond the edge. Both are the
// 0.5rem spacing step (`mx-2 mb-2` on the body, `p-2` on the workspace).
const BAND_REACH = "0.5rem";
// Kept clear at each end of the band, so the two bands of a pane that splits
// both ways never meet in its corner, and the band never runs round the
// pane's rounded corner.
const BAND_END_INSET = "var(--surface-radius)";

// Where a band sits: fixed, and placed with CSS anchor positioning against the
// pane's own box. The pane clips its content (`overflow: hidden`), and a fixed
// box escapes that clip while staying in the pane's DOM, its focus order, and
// its accessible tree. Chromium is the one supported engine, and it positions
// anchored fixed boxes as the page and the stacked workspace scroll.
// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning
function bandPlacement(edge: SplitEdge, anchor: string): React.CSSProperties {
	const placement: Record<string, string> =
		edge === "bottom"
			? {
					top: `calc(anchor(bottom) - ${BAND_REACH})`,
					height: `calc(${BAND_REACH} * 2)`,
					left: `calc(anchor(left) + ${BAND_END_INSET})`,
					right: `calc(anchor(right) + ${BAND_END_INSET})`,
				}
			: {
					left: `calc(anchor(right) - ${BAND_REACH})`,
					width: `calc(${BAND_REACH} * 2)`,
					top: `calc(anchor(top) + ${BAND_END_INSET})`,
					bottom: `calc(anchor(bottom) + ${BAND_END_INSET})`,
				};
	return { positionAnchor: anchor, ...placement } as React.CSSProperties;
}

// The control that grows the workspace: a band along the edge the new pane will
// appear on (option B, owner, 2026-09-19). Because a pane is only ever cut
// across an axis it spans whole, that edge is always an outer edge of the
// workspace: no band ever lands on the divider between two panes, so which pane
// is splitting is never in doubt and a resize separator's hit area and cursor
// are never shared with it.
//
// The band straddles the outer edge, over the pane's frame margin and the
// workspace padding beyond it, so it never covers the content box or its
// scrollbar. At rest it is invisible and only catches the pointer; reaching
// the edge, or keyboard focus, shows it whole: an accent tint, a dashed edge,
// and a plus with the words, written down the band on the right edge. Showing
// and hiding change only opacity, so nothing moves (§5, §7), and focus reveals
// it because nothing may depend on hover alone (§9). It stays outside the pane
// body, so reaching it is not entering the pane: it belongs to the workspace
// ring beside the pane frame (§9).
function SplitControl({
	edge,
	onSplit,
	view,
	anchor,
}: {
	readonly edge: SplitEdge;
	readonly onSplit: () => void;
	readonly view: string;
	readonly anchor: string;
}) {
	return (
		<ControlTooltip name={copy.a11y.addViewAt(edge, copy.workspace.pane(view))}>
			<button
				type="button"
				data-split-control={edge}
				onClick={onSplit}
				style={bandPlacement(edge, anchor)}
				className={cn(
					"fixed z-20 inline-flex items-center justify-center gap-1 overflow-hidden",
					"border border-selection-edge border-dashed bg-selection-fill bg-clip-padding",
					"cursor-pointer whitespace-nowrap font-medium text-foreground text-xs",
					"opacity-0 hover:opacity-100",
					disclosureTransitionStyles,
					// Plain focus, not focus-visible: a control that has the focus while
					// staying invisible is the failure this reveal rule exists to
					// prevent, and focus-visible would not match a programmatic focus.
					"focus:opacity-100",
					edge === "right" && "[writing-mode:vertical-rl]",
				)}
			>
				<IconPlus aria-hidden className="size-3.5 shrink-0" />
				<span>{copy.workspace.addView}</span>
			</button>
		</ControlTooltip>
	);
}
