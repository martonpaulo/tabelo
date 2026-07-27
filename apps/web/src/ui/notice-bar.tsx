import { Button } from "@tabelo/ui/components/button";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// Notices sit in the layout rather than floating over it. A toast that covers
// the table would be exactly the kind of interruption this product avoids —
// see docs/design-system.md §5.

export function NoticeBar() {
	const notice = useTabeloStore((state) => state.notice);
	const inputError = useTabeloStore((state) => state.inputError);
	const headerCorrection = useTabeloStore((state) => state.headerCorrection);
	const pendingPaneView = useTabeloStore((state) => state.pendingPaneView);
	const storageError = useTabeloStore((state) => state.storageError);

	// Transient confirmations clear themselves; anything actionable stays.
	useEffect(() => {
		if (!notice) return;
		const timer = setTimeout(
			() => useTabeloStore.setState({ notice: null }),
			4000,
		);
		return () => clearTimeout(timer);
	}, [notice]);

	if (storageError) {
		return (
			<Bar tone="warning">
				<span className="font-medium">{copy.notices.storageUnavailable}</span>
				<span className="text-muted-foreground">
					{copy.notices.storageUnavailableHint}
				</span>
			</Bar>
		);
	}

	if (inputError) {
		return (
			<Bar tone="warning">
				<span>{copy.notices.importError(inputError)}</span>
				<Dismiss />
			</Bar>
		);
	}

	if (headerCorrection) {
		return (
			<Bar tone="info">
				<span>{copy.notices.headerGuess}</span>
				<Button
					variant="outline"
					size="xs"
					onClick={() => useTabeloStore.getState().demoteHeader()}
				>
					{copy.notices.headerGuessAction}
				</Button>
				<Dismiss />
			</Bar>
		);
	}

	if (pendingPaneView) {
		return (
			<Bar tone="warning">
				<span>{copy.notices.pendingPaneView}</span>
				<Button
					variant="outline"
					size="xs"
					onClick={() => useTabeloStore.getState().confirmPaneView()}
				>
					{copy.notices.discardAndChangeView}
				</Button>
				<Dismiss />
			</Bar>
		);
	}

	if (notice) {
		return (
			<Bar tone="info">
				<span>{notice}</span>
				<Dismiss />
			</Bar>
		);
	}

	return null;
}

function Dismiss() {
	return (
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label="Dismiss"
			className="ml-auto"
			onClick={() => useTabeloStore.getState().dismissNotice()}
		>
			<X aria-hidden />
		</Button>
	);
}

function Bar({
	tone,
	children,
}: {
	readonly tone: "info" | "warning";
	readonly children: React.ReactNode;
}) {
	return (
		<div
			role="status"
			className={
				tone === "warning"
					? "flex shrink-0 items-center gap-2 border-line-subtle border-b bg-destructive/10 px-3 py-1.5 text-xs"
					: "flex shrink-0 items-center gap-2 border-line-subtle border-b bg-surface-header px-3 py-1.5 text-xs"
			}
		>
			{children}
		</div>
	);
}
