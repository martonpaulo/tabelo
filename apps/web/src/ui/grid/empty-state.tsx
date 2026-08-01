import { ClipboardPaste, Table2, Upload } from "lucide-react";
import { copy } from "@/copy/copy";
import { pasteFromClipboard } from "@/ui/clipboard-actions";
import { importTableFile } from "@/ui/import";
import {
	DialogActions,
	DialogAlternative,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";

// The first-visit choice is one product-owned surface over the normal workspace.
// The workspace remains visible enough to explain where the table will appear,
// but is inert until the user chooses how to begin.
export function EmptyState({
	onStartEmpty,
	onStarted,
}: {
	readonly onStartEmpty: () => void;
	readonly onStarted: () => void;
}) {
	return (
		<div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-app/60 p-4 supports-backdrop-filter:backdrop-blur-sm">
			<section
				aria-labelledby="empty-state-title"
				className="w-auto min-w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-surface bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-line-strong"
			>
				<h2 id="empty-state-title" className="font-medium text-sm">
					{copy.empty.title}
				</h2>
				<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
					{copy.empty.body}
				</p>
				<DialogActions>
					<DialogAlternative
						onClick={() => {
							void pasteFromClipboard().then((started) => {
								if (started) onStarted();
							});
						}}
					>
						<ClipboardPaste aria-hidden />
						{copy.empty.pasteHint}
					</DialogAlternative>
					<DialogAlternative
						onClick={() => {
							void importTableFile().then((started) => {
								if (started) onStarted();
							});
						}}
					>
						<Upload aria-hidden />
						{copy.actions.importFile}
					</DialogAlternative>
					<DialogConfirm onClick={onStartEmpty}>
						<Table2 aria-hidden />
						{copy.empty.emptyAction}
					</DialogConfirm>
				</DialogActions>
			</section>
		</div>
	);
}
