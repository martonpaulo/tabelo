import { copy } from "@/copy/copy";
import type { PreconditionFailure } from "@/formats/types";

// The reason a view cannot show this table. It is a message, not a field: the
// textarea this replaced clipped its own text to three rows and scrolled the
// rest out of sight, which is the one thing an explanation must not do.
// Selection is re-enabled explicitly, because the app disables it everywhere
// that is not view content.

export function BlockedState({
	failure,
}: {
	readonly failure: PreconditionFailure;
}) {
	return (
		<div
			role="status"
			aria-label={copy.a11y.blockedView}
			className="flex h-full items-center justify-center overflow-y-auto bg-surface-readonly p-4 text-center text-muted-foreground text-sm"
		>
			<p className="max-w-md select-text text-pretty">
				{copy.source.blocked(failure)}
			</p>
		</div>
	);
}
