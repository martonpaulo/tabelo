import { Button } from "@tabelo/ui/components/button";
import { Textarea } from "@tabelo/ui/components/textarea";
import { Toggle } from "@tabelo/ui/components/toggle";
import { cn } from "@tabelo/ui/lib/utils";
import {
	IconArrowsExchange,
	IconChevronDown,
	IconChevronRight,
	IconChevronUp,
	IconLetterCase,
	IconMarquee2,
	IconReplace,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { copy } from "@/copy/copy";
import { gridFind, useTabeloStore } from "@/state/store";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import type { ViewDefinition } from "@/views/types";
import type { FindSummary, FindTarget } from "./use-pane-find";

// A pane's find and replace bar: a band at the foot of the pane, below what the
// pane shows and above nothing. It belongs to the pane the way the header does,
// so it covers no content and the query field can take whatever width the pane
// has. Every pane has its own (#280), each searching what that pane shows. See
// docs/design-system/3-components.md.
//
// One row by default, because finding is the errand and replacing is not.
// Asking for replace adds the second row and its own controls, and the
// disclosure is transient state like everything else here. A read-only view
// has no replace row and no disclosure at all, rather than disabled ones.
//
// It owns no matching of its own. What the user typed is the pane's entry in
// the store. The grid searches the document, so its results are in the store
// too; a source or preview pane searches its own text, so its surface answers
// through the target it registered and the summary it reports. Either way the
// count comes from the same place as the mark, so the two cannot disagree.

// Whether there is a result to report at all. An empty query and an empty
// result are different states: "No matches" for a search nobody started would
// be a refusal the user did not earn.
function hasResult(query: string, total: number): boolean {
	return total > 0 || query !== "";
}

// The bar keeps the caret while the surface moves underneath it, so nothing
// else would say where the walk arrived. It goes through the one shared polite
// channel rather than a live region of its own: see §9. Spoken in full, because
// a sentence read on its own has no controls beside it to give the compact
// legend its meaning.
function announce(reached: FindSummary | null, searched: string): void {
	const found = reached?.total ?? 0;
	if (!hasResult(searched, found)) return;
	useTabeloStore
		.getState()
		.announceStatus(
			found === 0
				? copy.find.noMatches
				: reached && reached.index >= 0
					? copy.find.position(reached.index + 1, found)
					: copy.find.positionUnplaced(found),
		);
}

// One of the bar's two fields.
//
// A textarea rather than an input, for the same reason the cell editor is one:
// a cell may legitimately hold a line break, so a query and a replacement may
// too, and an input would silently flatten what was pasted in. It starts one
// row tall and grows with what it holds up to three rows, then scrolls, so a
// long query is readable without the bar taking the pane.
//
// Growth is the browser's own `field-sizing: content`, which the shared
// primitive already declares; measuring `scrollHeight` on every keystroke would
// be reimplementing it by hand.
// https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing
function FindField({
	label,
	value,
	monospace,
	fieldRef,
	onChange,
	onSubmit,
}: {
	readonly label: string;
	readonly value: string;
	// A query typed against a monospaced source reads the way the source does.
	readonly monospace: boolean;
	readonly fieldRef?: React.RefObject<HTMLTextAreaElement | null>;
	readonly onChange: (value: string) => void;
	// Enter, with whether Shift was held. A newline reaches the field by paste
	// rather than by keystroke, because Enter is what navigates and replaces.
	readonly onSubmit: (shiftKey: boolean) => void;
}) {
	return (
		<Textarea
			ref={fieldRef}
			rows={1}
			value={value}
			aria-label={label}
			placeholder={label}
			spellCheck={false}
			className={cn(
				"max-h-14 min-h-control-sm min-w-0 flex-1 overflow-auto py-1",
				monospace && "font-source",
			)}
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				onSubmit(event.shiftKey);
			}}
		/>
	);
}

interface PaneFindBarProps {
	readonly paneId: string;
	readonly view: ViewDefinition;
	// The surface searching this pane's own text, and what it last reported.
	// Both absent for the grid, whose results the store derives.
	readonly target: FindTarget | null;
	readonly summary: FindSummary | null;
	// Bumped by every request to open the bar, so asking again while it is open
	// brings the caret back to the query.
	readonly focusRequest: number;
}

export function PaneFindBar({
	paneId,
	view,
	target,
	summary,
	focusRequest,
}: PaneFindBarProps) {
	const find = useTabeloStore((state) => state.finds[paneId] ?? null);
	const queryRef = useRef<HTMLTextAreaElement>(null);
	// Which matcher answers is the view's kind, like every other decision about
	// what a pane shows; whether it may replace is the registry's editability.
	// Neither is ever a view id: see docs/adr/0005.
	const searchesDocument = view.kind === "grid";
	const replaceable = view.capabilities.editable;

	// Opening the bar puts the caret where the user is about to type, whether
	// the command came from the keyboard or from the pane menu.
	const open = find !== null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new request is the trigger, not a value read here
	useEffect(() => {
		if (!open) return;
		const input = queryRef.current;
		input?.focus();
		input?.select();
	}, [open, focusRequest]);

	// A surface that searches its own text is told what to look for, and told
	// again whenever the query, the case toggle, or the surface itself changes.
	// Closing takes its marks away with the bar.
	const query = find?.query;
	const caseSensitive = find?.caseSensitive;
	useEffect(() => {
		if (searchesDocument || !target) return;
		if (query === undefined || caseSensitive === undefined) {
			target.close();
			return;
		}
		announce(target.search(query, caseSensitive), query);
	}, [searchesDocument, target, query, caseSensitive]);

	if (!find) return null;

	const result: FindSummary | null = searchesDocument
		? { total: find.matches.length, index: find.index }
		: summary;
	const total = result?.total ?? 0;
	const noMatchReason =
		total > 0
			? undefined
			: searchesDocument
				? copy.disabled.noMatchingCell
				: copy.disabled.noMatchingText;
	const stepReason =
		total > 0
			? undefined
			: find.query === ""
				? copy.disabled.noQuery
				: noMatchReason;

	const storeResult = (): FindSummary | null => {
		const current = gridFind(useTabeloStore.getState());
		return current
			? { total: current.matches.length, index: current.index }
			: null;
	};

	// The store holds what was asked. A surface searching its own text hears
	// about it through the effect above, which also speaks its answer, so the
	// search runs once per change however it was made.
	const search = (change: { query?: string; caseSensitive?: boolean }) => {
		const store = useTabeloStore.getState();
		if (change.query !== undefined) store.setFindQuery(paneId, change.query);
		if (change.caseSensitive !== undefined)
			store.setFindCaseSensitive(paneId, change.caseSensitive);
		const next = useTabeloStore.getState().finds[paneId];
		if (next && searchesDocument) announce(storeResult(), next.query);
	};

	const step = (offset: 1 | -1) => {
		let reached: FindSummary | null;
		if (searchesDocument) {
			useTabeloStore.getState().stepFindMatch(offset);
			reached = storeResult();
		} else {
			reached = target?.step(offset) ?? null;
		}
		announce(reached, find.query);
	};

	const replaceOne = () => {
		const replaced = searchesDocument
			? useTabeloStore.getState().replaceCurrentMatch()
			: (target?.replaceCurrent?.(find.replacement) ?? false);
		useTabeloStore
			.getState()
			.announceStatus(
				replaced ? copy.find.replaced(1) : copy.find.nothingReplaced,
			);
	};

	const replaceAll = () => {
		const count = searchesDocument
			? useTabeloStore.getState().replaceAllMatches()
			: (target?.replaceAll?.(find.replacement) ?? 0);
		useTabeloStore
			.getState()
			.announceStatus(
				count > 0 ? copy.find.replaced(count) : copy.find.nothingReplaced,
			);
	};

	const close = () => {
		useTabeloStore.getState().closeFind(paneId);
		// Back to the pane's own surface, so it keeps the keyboard instead of
		// the page dropping focus on the document body. For the grid that is
		// the cell the last match left selected.
		if (target) {
			target.focus();
			return;
		}
		window.document
			.querySelector<HTMLElement>(
				`[data-pane-id="${paneId}"] [data-grid-active="true"]`,
			)
			?.focus();
	};

	// Escape closes from anywhere inside the bar. The modifier reselects the
	// query rather than handing the page to the browser's own find, which would
	// open a second search over the one already on screen.
	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
			event.preventDefault();
			queryRef.current?.focus();
			queryRef.current?.select();
		}
	};

	const monospace = view.kind === "source";
	const replacing = replaceable && find.replacing;

	return (
		// A named region rather than a toolbar: these are ordinary tab stops, and
		// a toolbar role would claim the arrow keys the two text fields need.
		<section
			aria-label={replaceable ? copy.find.title : copy.find.titleReadOnly}
			data-slot="find-bar"
			className="sticky bottom-0 left-0 z-40 mt-auto flex w-full shrink-0 flex-col gap-1.5 border-line-subtle border-t bg-surface-header px-2 py-1.5 group-data-[under-fab]/pane:pr-fab-safe"
			onKeyDown={onKeyDown}
		>
			<div className="flex items-start gap-1.5">
				{replaceable ? (
					<ControlTooltip
						name={replacing ? copy.find.hideReplace : copy.find.showReplace}
					>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-expanded={replacing}
							onClick={() =>
								useTabeloStore.getState().setFindReplacing(paneId, !replacing)
							}
						>
							{replacing ? (
								<IconChevronDown aria-hidden />
							) : (
								<IconChevronRight aria-hidden />
							)}
						</Button>
					</ControlTooltip>
				) : null}

				<FindField
					label={copy.find.query}
					value={find.query}
					monospace={monospace}
					fieldRef={queryRef}
					onChange={(next) => search({ query: next })}
					onSubmit={(shiftKey) => {
						if (total === 0) return;
						step(shiftKey ? -1 : 1);
					}}
				/>

				{/* The buttons below stay in the tab order while there is nothing to
				    step through, so their reason reaches the keyboard too (#376). */}
				{/* Passive text, never a control: it states which occurrence the pane
				    is marking, which is the written half of a cue that is otherwise
				    only a colour. Tabular figures and a reserved width keep the
				    buttons beside it still as the number climbs. */}
				<span
					data-slot="find-position"
					className="flex h-control-sm min-w-10 shrink-0 items-center justify-center text-muted-foreground text-xs tabular-nums"
				>
					{hasResult(find.query, total)
						? total > 0 && result && result.index < 0
							? copy.find.countUnplaced(total)
							: copy.find.count(
									total === 0 ? 0 : (result?.index ?? 0) + 1,
									total,
								)
						: null}
				</span>

				<ControlTooltip name={copy.find.previous} reason={stepReason}>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={total === 0}
						focusableWhenDisabled={total === 0}
						onClick={() => step(-1)}
					>
						<IconChevronUp aria-hidden />
					</Button>
				</ControlTooltip>
				<ControlTooltip name={copy.find.next} reason={stepReason}>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={total === 0}
						focusableWhenDisabled={total === 0}
						onClick={() => step(1)}
					>
						<IconChevronDown aria-hidden />
					</Button>
				</ControlTooltip>
				{/* Every matching cell becomes one selected area, which hands the
				    result straight to the operations that already act on a selection:
				    clear, copy, delete, alignment. The grid's own extent
				    announcement says how many, so nothing is announced twice. A
				    command about cells, so only the pane that shows cells has it. */}
				{searchesDocument ? (
					<ControlTooltip name={copy.find.selectAll} reason={noMatchReason}>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={total === 0}
							focusableWhenDisabled={total === 0}
							onClick={() => useTabeloStore.getState().selectAllMatches()}
						>
							<IconMarquee2 aria-hidden />
						</Button>
					</ControlTooltip>
				) : null}
				<ControlTooltip name={copy.find.matchCase}>
					<Toggle
						size="sm"
						pressed={find.caseSensitive}
						onPressedChange={(pressed) => search({ caseSensitive: pressed })}
					>
						<IconLetterCase aria-hidden />
					</Toggle>
				</ControlTooltip>

				<ControlTooltip name={copy.find.close}>
					<Button variant="ghost" size="icon-sm" onClick={close}>
						<IconX aria-hidden />
					</Button>
				</ControlTooltip>
			</div>

			{replacing ? (
				<div className="flex items-start gap-1.5">
					{/* Holds the disclosure control's track, so the two fields line up
					    on their leading edge instead of stepping. */}
					<span aria-hidden className="size-control-sm shrink-0" />
					<FindField
						label={copy.find.replacement}
						value={find.replacement}
						monospace={monospace}
						onChange={(next) =>
							useTabeloStore.getState().setFindReplacement(paneId, next)
						}
						onSubmit={() => {
							if (total === 0) return;
							replaceOne();
						}}
					/>
					<ControlTooltip name={copy.find.replace} reason={noMatchReason}>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={total === 0}
							focusableWhenDisabled={total === 0}
							onClick={replaceOne}
						>
							<IconReplace aria-hidden />
						</Button>
					</ControlTooltip>
					<ControlTooltip name={copy.find.replaceAll} reason={noMatchReason}>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={total === 0}
							focusableWhenDisabled={total === 0}
							onClick={replaceAll}
						>
							<IconArrowsExchange aria-hidden />
						</Button>
					</ControlTooltip>
				</div>
			) : null}
		</section>
	);
}
