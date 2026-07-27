import { Button } from "@tabelo/ui/components/button";
import { X } from "lucide-react";
import { useEffect } from "react";
import { getCodec } from "@/formats";
import { downloadText } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import type { PwaUpdate } from "@/ui/pwa-update";

// Notices sit in the layout rather than floating over it. A toast that covers
// the table would be exactly the kind of interruption this product avoids —
// see docs/design-system.md §5.

export function NoticeBar({ pwaUpdate }: { readonly pwaUpdate: PwaUpdate }) {
	const notice = useTabeloStore((state) => state.notice);
	const inputError = useTabeloStore((state) => state.inputError);
	const headerCorrection = useTabeloStore((state) => state.headerCorrection);
	const pendingPaneView = useTabeloStore((state) => state.pendingPaneView);
	const storageIssue = useTabeloStore((state) => state.storageIssue);

	// Transient confirmations clear themselves; anything actionable stays.
	useEffect(() => {
		if (!notice) return;
		const timer = setTimeout(
			() => useTabeloStore.setState({ notice: null }),
			4000,
		);
		return () => clearTimeout(timer);
	}, [notice]);

	if (storageIssue?.kind === "unavailable" || storageIssue?.kind === "quota") {
		return (
			<Bar tone="warning">
				<span className="font-medium">
					{storageIssue.kind === "unavailable"
						? copy.notices.storageUnavailable
						: copy.notices.storageQuota}
				</span>
				<Button variant="outline" size="xs" onClick={downloadCurrentTable}>
					{copy.notices.downloadCopy}
				</Button>
			</Bar>
		);
	}

	if (storageIssue?.kind === "unreadable") {
		const recoveryFailure =
			storageIssue.replacementFailure === "unavailable"
				? copy.notices.storageRecoveryUnavailable
				: storageIssue.replacementFailure === "quota"
					? copy.notices.storageRecoveryQuota
					: null;
		return (
			<Bar tone="warning">
				<span className="font-medium">{copy.notices.savedTableUnreadable}</span>
				{recoveryFailure ? (
					<span className="text-muted-foreground">{recoveryFailure}</span>
				) : null}
				<Button
					variant="outline"
					size="xs"
					onClick={() =>
						downloadText("tabelo-recovery.txt", "text/plain", storageIssue.raw)
					}
				>
					{copy.notices.downloadOriginal}
				</Button>
				<Button
					variant="outline"
					size="xs"
					onClick={() => {
						const store = useTabeloStore.getState();
						if (store.replaceUnreadableStorage()) {
							store.setNotice(copy.notices.replacedSavedData);
						}
					}}
				>
					{copy.notices.replaceSavedData}
				</Button>
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

	if (pwaUpdate.ready) {
		return (
			<Bar tone="info">
				<span>{copy.notices.updateReady}</span>
				<Button
					variant="outline"
					size="xs"
					disabled={pwaUpdate.updating}
					onClick={pwaUpdate.apply}
				>
					{pwaUpdate.updating
						? copy.notices.savingUpdate
						: copy.notices.saveAndReload}
				</Button>
			</Bar>
		);
	}

	return null;
}

function downloadCurrentTable() {
	const codec = getCodec("markdown");
	downloadText(
		`table.${codec.extension}`,
		codec.mimeType,
		codec.serialize(useTabeloStore.getState().document),
	);
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
