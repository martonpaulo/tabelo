import { copy } from "@/copy/copy";
import type { PreconditionFailure } from "@/formats/types";

export function BlockedState({
	failure,
}: {
	readonly failure: PreconditionFailure;
}) {
	return (
		<div
			role="status"
			className="flex h-full items-center justify-center bg-surface-readonly p-4 text-center text-muted-foreground text-sm"
		>
			<textarea
				readOnly
				aria-label={copy.a11y.blockedView}
				value={copy.source.blocked(failure)}
				rows={3}
				className="max-w-md resize-none border-0 bg-transparent text-center focus-visible:outline-2 focus-visible:outline-selection-edge"
			/>
		</div>
	);
}
