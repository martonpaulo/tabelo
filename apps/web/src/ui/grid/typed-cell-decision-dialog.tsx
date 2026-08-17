import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { useId } from "react";
import { copy } from "@/copy/copy";
import { cellText } from "@/core/cell-value";
import type { CellPosition } from "@/core/selection";
import type { ExpectedTypeParseResult } from "@/core/typed-input";
import type { ExpectedColumnType } from "@/core/types";
import {
	DialogActions,
	DialogAlternative,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";

type TypedDecisionResult = Extract<
	ExpectedTypeParseResult,
	{ readonly kind: "lossy-choice" | "invalid" }
>;

export interface TypedCellDecision {
	readonly position: CellPosition;
	readonly draft: string;
	readonly expectedType: Exclude<ExpectedColumnType, "text">;
	readonly result: TypedDecisionResult;
}

export function TypedCellDecisionDialog({
	decision,
	open,
	finalFocus,
	onKeepEditing,
	onKeepText,
	onConvert,
	onOpenChangeComplete,
}: {
	readonly decision: TypedCellDecision | null;
	readonly open: boolean;
	readonly finalFocus: () => HTMLElement | null;
	readonly onKeepEditing: () => void;
	readonly onKeepText: () => void;
	readonly onConvert: () => void;
	readonly onOpenChangeComplete: (open: boolean) => void;
}) {
	const titleId = useId();
	const descriptionId = useId();
	if (!decision) return null;

	const lossy = decision.result.kind === "lossy-choice";

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onKeepEditing();
			}}
			onOpenChangeComplete={onOpenChangeComplete}
		>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				finalFocus={finalFocus}
				className="sm:w-md"
			>
				<DialogHeader>
					<DialogTitle id={titleId}>
						{lossy
							? copy.typedEditing.choiceTitle
							: copy.typedEditing.invalidTitle}
					</DialogTitle>
					<DialogDescription id={descriptionId}>
						{lossy
							? copy.typedEditing.choiceDescription(
									decision.expectedType,
									decision.draft,
									cellText(decision.result.typedValue),
								)
							: copy.typedEditing.invalidDescription(
									decision.expectedType,
									decision.draft,
								)}
					</DialogDescription>
				</DialogHeader>

				<DialogActions>
					<DialogCancel>{copy.typedEditing.keepEditing}</DialogCancel>
					{lossy ? (
						<DialogAlternative type="button" onClick={onKeepText}>
							{copy.typedEditing.keepAsText}
						</DialogAlternative>
					) : null}
					<DialogConfirm type="button" onClick={lossy ? onConvert : onKeepText}>
						{lossy
							? copy.typedEditing.convertTo(decision.expectedType)
							: copy.typedEditing.changeToText}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
