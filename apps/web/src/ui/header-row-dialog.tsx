import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { cn } from "@tabelo/ui/lib/utils";
import { useId, useRef } from "react";
import { copy } from "@/copy/copy";
import {
	type ImportSample,
	importSample,
	sampleColumnShares,
} from "@/import/sample";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogAlternative,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { paneEntryTarget } from "@/ui/primitives/panel";
import { paneSelector } from "@/ui/workspace/pane-selector";

export function HeaderRowDialog({
	onImported,
}: {
	readonly onImported: () => void;
}) {
	const pending = useTabeloStore((state) => state.pendingImport);
	const open = pending !== null;
	const answered = useRef(false);
	// The last sample stays while the dialog runs its close transition, so its
	// content does not collapse as it goes.
	const lastSample = useRef<ImportSample | null>(null);
	if (pending) lastSample.current = importSample(pending.prepared.matrix);
	const sample = lastSample.current;

	const answer = (headerRow: boolean) => {
		answered.current = true;
		useTabeloStore.getState().answerPendingImport(headerRow);
		onImported();
	};

	// An answer replaces the document, so the cell that opened the question no
	// longer exists and the dialog would hand focus to nothing; the workspace
	// then fell back to the pane itself, one level out, where the arrow keys do
	// nothing (#350). Focus goes where entering the active pane would put it.
	// A cancel changes nothing, so the primitive's own return still holds.
	const finalFocus = () => {
		if (!answered.current) return true;
		answered.current = false;
		// This runs after the close transition, so anything the user focused in
		// the meantime wins: only focus that is still lost is placed.
		// Lost means the body, the closing dialog's own portal (its buttons and
		// focus guards), or a pane frame, which is where the primitive's own
		// fallback lands when the element that opened the dialog is gone.
		const active = window.document.activeElement;
		if (
			active !== null &&
			active !== window.document.body &&
			!active.closest("[data-base-ui-portal]") &&
			!active.hasAttribute("data-pane-id")
		) {
			return false;
		}
		const { activePaneId } = useTabeloStore.getState().workspace;
		const pane = document.querySelector<HTMLElement>(
			paneSelector(activePaneId),
		);
		return (pane && paneEntryTarget(pane)) ?? true;
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) useTabeloStore.getState().cancelPendingImport();
			}}
		>
			<DialogContent finalFocus={finalFocus} width="wide">
				<DialogHeader>
					<DialogTitle>{copy.headerImport.title}</DialogTitle>
					<DialogDescription>{copy.headerImport.description}</DialogDescription>
				</DialogHeader>
				{sample && sample.rows.length > 0 ? (
					<IncomingSample sample={sample} />
				) : null}
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogAlternative onClick={() => answer(false)}>
						{copy.headerImport.asData}
					</DialogAlternative>
					<DialogConfirm onClick={() => answer(true)}>
						{copy.headerImport.asHeaders}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}

// The incoming rows, read-only and bounded (#454). Every row sits in the body,
// because which one is the header is the question being asked; row 1 is told
// apart by its number and the stronger rule under it. Fixed layout at the
// dialog's width, so a narrow window wraps the text instead of scrolling it
// sideways, and nothing here takes focus before the buttons. Each column's
// width follows its own words (#577), so a word that fits is never split;
// the percentages share what the row-number column leaves.
function IncomingSample({ sample }: { readonly sample: ImportSample }) {
	const omitted = sample.omittedRows > 0 || sample.omittedColumns > 0;
	const omittedId = useId();
	const shares = sampleColumnShares(sample);
	return (
		<div className="grid min-w-0 gap-1.5">
			<table
				aria-label={copy.headerImport.sample}
				aria-describedby={omitted ? omittedId : undefined}
				className="rounded-interactive border-line-subtle w-full table-fixed border-separate border-spacing-0 overflow-hidden border text-xs"
			>
				<colgroup>
					<col className="w-8" />
					{shares.map((share, column) => (
						// One column per sample column, never reordered.
						<col key={column} style={{ width: `${share * 100}%` }} />
					))}
				</colgroup>
				<tbody>
					{sample.rows.map((row, rowIndex) => (
						<tr
							// The sample is rebuilt from the same prepared input each
							// render and never reordered, so the index is its identity.
							key={rowIndex}
							className={cn(rowIndex === 0 && "bg-surface-header")}
						>
							<th
								scope="row"
								aria-label={copy.headerImport.rowNumber(rowIndex + 1)}
								className={cn(
									"text-muted-foreground w-8 px-2 py-1.5 text-right align-top font-normal tabular-nums",
									rowIndex === 0
										? "border-line-strong border-b"
										: "border-line-subtle border-b",
									rowIndex === sample.rows.length - 1 && "border-b-0",
								)}
							>
								{rowIndex + 1}
							</th>
							{row.map((cell, columnIndex) => (
								<td
									key={columnIndex}
									className={cn(
										"px-2 py-1.5 align-top",
										rowIndex === 0
											? "border-line-strong border-b font-medium"
											: "border-line-subtle border-b",
										rowIndex === sample.rows.length - 1 && "border-b-0",
									)}
								>
									{/* The clamp sits inside the cell: on the cell itself it
									    would change its display and break the table. */}
									<div className="line-clamp-3 break-words whitespace-pre-line">
										{cell.text}
									</div>
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{omitted ? (
				<p id={omittedId} className="text-muted-foreground text-xs">
					{copy.headerImport.omitted(sample.omittedRows, sample.omittedColumns)}
				</p>
			) : null}
		</div>
	);
}
