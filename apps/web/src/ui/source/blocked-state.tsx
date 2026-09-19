import { copy } from "@/copy/copy";
import type { PreconditionFailure } from "@/formats/types";
import { preconditionRecovery } from "@/ui/precondition-recovery";
import { RecoveryButton } from "@/ui/primitives/recovery-command";
import { AvailabilityStatus } from "@/ui/primitives/selection-option";

// The reason a view cannot show this table. It is a message, not a field: the
// textarea this replaced clipped its own text to three rows and scrolled the
// rest out of sight, which is the one thing an explanation must not do.
// Selection is re-enabled explicitly, because the app disables it everywhere
// that is not view content.
//
// It says so the way the view choosers do (owner, 2026-09-19): the same alert
// and "Unavailable" status, and, when the refusal names a position, the same
// Go to cell command beside the reason, so a pane that became blocked offers
// the correction a dialog listing the same view would.

export function BlockedState({
	failure,
	target,
}: {
	readonly failure: PreconditionFailure;
	// The view that is blocked, which names the recovery command.
	readonly target: string;
}) {
	const recovery = preconditionRecovery(failure);
	return (
		<div
			role="status"
			aria-label={copy.a11y.blockedView}
			className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center text-sm"
		>
			<AvailabilityStatus kind="unavailable" />
			<p className="max-w-md select-text text-pretty text-muted-foreground">
				{copy.source.blocked(failure)}
			</p>
			{recovery ? <RecoveryButton recovery={recovery} target={target} /> : null}
		</div>
	);
}
