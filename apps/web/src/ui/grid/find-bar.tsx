import { Button } from "@tabelo/ui/components/button";
import { Textarea } from "@tabelo/ui/components/textarea";
import { Toggle } from "@tabelo/ui/components/toggle";
import {
	CaseSensitive,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	Replace,
	ReplaceAll,
	SquareDashedMousePointer,
	X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";

// The grid pane's find and replace bar: a band at the foot of the pane, below
// the table and above nothing. It belongs to the pane the way the header does,
// so it covers no cell and the query field can take whatever width the pane
// has. See docs/design-system.md §3.
//
// One row by default, because finding is the errand and replacing is not.
// Asking for replace adds the second row and its own controls, and the
// disclosure is transient state like everything else here.
//
// It owns no matching of its own. Every control reads and writes the one
// transient find state in the store, so what the count says and what the grid
// marks can never disagree.

// Whether there is a result to report at all. An empty query and an empty
// result are different states: "No matches" for a search nobody started would
// be a refusal the user did not earn.
function hasResult(query: string, total: number): boolean {
	return total > 0 || query !== "";
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
	fieldRef,
	onChange,
	onSubmit,
}: {
	readonly label: string;
	readonly value: string;
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
			className="max-h-14 min-h-control-sm min-w-0 flex-1 overflow-auto py-1"
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				onSubmit(event.shiftKey);
			}}
		/>
	);
}

export function GridFindBar() {
	const find = useTabeloStore((state) => state.find);
	const queryRef = useRef<HTMLTextAreaElement>(null);

	// Opening the bar puts the caret where the user is about to type, whether
	// the command came from the keyboard or from the pane menu.
	const open = find !== null;
	useEffect(() => {
		if (!open) return;
		const input = queryRef.current;
		input?.focus();
		input?.select();
	}, [open]);

	if (!find) return null;

	const total = find.matches.length;
	const noMatchReason = total > 0 ? undefined : copy.disabled.noMatchingCell;
	const stepReason =
		total > 0
			? undefined
			: find.query === ""
				? copy.disabled.noQuery
				: noMatchReason;

	// The bar keeps the caret while the grid moves underneath it, so nothing
	// else would say where the walk arrived. It goes through the one shared
	// polite channel rather than a live region of its own: see §9. Spoken in
	// full, because a sentence read on its own has no controls beside it to
	// give the compact legend its meaning.
	const announcePosition = () => {
		const next = useTabeloStore.getState().find;
		if (!next) return;
		const found = next.matches.length;
		if (!hasResult(next.query, found)) return;
		useTabeloStore
			.getState()
			.announceStatus(
				found === 0
					? copy.find.noMatches
					: copy.find.position(next.index + 1, found),
			);
	};

	const step = (offset: 1 | -1) => {
		useTabeloStore.getState().stepFindMatch(offset);
		announcePosition();
	};

	const replaceOne = () => {
		const replaced = useTabeloStore.getState().replaceCurrentMatch();
		useTabeloStore
			.getState()
			.announceStatus(
				replaced ? copy.find.replaced(1) : copy.find.nothingReplaced,
			);
	};

	const replaceAll = () => {
		const count = useTabeloStore.getState().replaceAllMatches();
		useTabeloStore
			.getState()
			.announceStatus(
				count > 0 ? copy.find.replaced(count) : copy.find.nothingReplaced,
			);
	};

	const close = () => {
		useTabeloStore.getState().closeFind();
		// Back to the cell the last match left selected, so the grid keeps the
		// keyboard instead of the page dropping focus on the document body.
		window.document
			.querySelector<HTMLElement>('[data-grid-active="true"]')
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

	return (
		// A named region rather than a toolbar: these are ordinary tab stops, and
		// a toolbar role would claim the arrow keys the two text fields need.
		<section
			aria-label={copy.find.title}
			data-slot="find-bar"
			className="sticky bottom-0 left-0 z-40 mt-auto flex w-full shrink-0 flex-col gap-1.5 border-line-subtle border-t bg-surface-header px-2 py-1.5"
			onKeyDown={onKeyDown}
		>
			<div className="flex items-start gap-1.5">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={
						find.replacing ? copy.find.hideReplace : copy.find.showReplace
					}
					aria-expanded={find.replacing}
					onClick={() =>
						useTabeloStore.getState().setFindReplacing(!find.replacing)
					}
				>
					{find.replacing ? (
						<ChevronDown aria-hidden />
					) : (
						<ChevronRight aria-hidden />
					)}
				</Button>

				<FindField
					label={copy.find.query}
					value={find.query}
					fieldRef={queryRef}
					onChange={(next) => {
						useTabeloStore.getState().setFindQuery(next);
						announcePosition();
					}}
					onSubmit={(shiftKey) => {
						if (total === 0) return;
						step(shiftKey ? -1 : 1);
					}}
				/>

				{/* Passive text, never a control: it states which occurrence the grid
				    is marking, which is the written half of a cue that is otherwise
				    only a colour. Tabular figures and a reserved width keep the
				    buttons beside it still as the number climbs. */}
				<span
					data-slot="find-position"
					className="flex h-control-sm min-w-10 shrink-0 items-center justify-center text-muted-foreground text-xs tabular-nums"
				>
					{hasResult(find.query, total)
						? copy.find.count(total === 0 ? 0 : find.index + 1, total)
						: null}
				</span>

				<DisabledTooltip reason={stepReason}>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={total === 0}
						aria-label={copy.find.previous}
						onClick={() => step(-1)}
					>
						<ChevronUp aria-hidden />
					</Button>
				</DisabledTooltip>
				<DisabledTooltip reason={stepReason}>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={total === 0}
						aria-label={copy.find.next}
						onClick={() => step(1)}
					>
						<ChevronDown aria-hidden />
					</Button>
				</DisabledTooltip>
				{/* Every matching cell becomes one selected area, which hands the
				    result straight to the operations that already act on a selection:
				    clear, copy, delete, alignment. The grid's own extent
				    announcement says how many, so nothing is announced twice. */}
				<DisabledTooltip reason={noMatchReason}>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={total === 0}
						aria-label={copy.find.selectAll}
						onClick={() => useTabeloStore.getState().selectAllMatches()}
					>
						<SquareDashedMousePointer aria-hidden />
					</Button>
				</DisabledTooltip>
				<Toggle
					size="sm"
					pressed={find.caseSensitive}
					aria-label={copy.find.matchCase}
					onPressedChange={(pressed) => {
						useTabeloStore.getState().setFindCaseSensitive(pressed);
						announcePosition();
					}}
				>
					<CaseSensitive aria-hidden />
				</Toggle>

				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={copy.find.close}
					onClick={close}
				>
					<X aria-hidden />
				</Button>
			</div>

			{find.replacing ? (
				<div className="flex items-start gap-1.5">
					{/* Holds the disclosure control's track, so the two fields line up
					    on their leading edge instead of stepping. */}
					<span aria-hidden className="size-control-sm shrink-0" />
					<FindField
						label={copy.find.replacement}
						value={find.replacement}
						onChange={(next) =>
							useTabeloStore.getState().setFindReplacement(next)
						}
						onSubmit={() => {
							if (total === 0) return;
							replaceOne();
						}}
					/>
					<DisabledTooltip reason={noMatchReason}>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={total === 0}
							aria-label={copy.find.replace}
							onClick={replaceOne}
						>
							<Replace aria-hidden />
						</Button>
					</DisabledTooltip>
					<DisabledTooltip reason={noMatchReason}>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={total === 0}
							aria-label={copy.find.replaceAll}
							onClick={replaceAll}
						>
							<ReplaceAll aria-hidden />
						</Button>
					</DisabledTooltip>
				</div>
			) : null}
		</section>
	);
}
