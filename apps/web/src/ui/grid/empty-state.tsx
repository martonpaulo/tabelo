import { ClipboardPaste, Table2, Upload } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { copy } from "@/copy/copy";
import { product } from "@/copy/product";
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
	const sectionRef = useRef<HTMLElement>(null);

	useLayoutEffect(() => {
		sectionRef.current?.focus();
	}, []);

	return (
		<div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-app/60 p-4 supports-backdrop-filter:backdrop-blur-sm">
			<section
				ref={sectionRef}
				aria-labelledby="empty-state-title"
				tabIndex={-1}
				className="w-auto min-w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-surface bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-line-strong focus-visible:outline-2 focus-visible:outline-selection-edge focus-visible:-outline-offset-2"
			>
				<p className="mb-4 text-muted-foreground text-sm leading-relaxed">
					<span className="font-semibold text-foreground">{product.name}</span>
					{": "}
					{copy.empty.intro}.
				</p>
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
				<p className="mt-4 text-muted-foreground text-xs">
					{copy.empty.credit}{" "}
					<a
						href={product.author.url}
						target="_blank"
						rel="noreferrer"
						className="text-foreground underline underline-offset-2"
					>
						{product.author.name}
					</a>
					{" · "}
					<a
						href={product.repositoryUrl}
						target="_blank"
						rel="noreferrer"
						className="text-foreground underline underline-offset-2"
					>
						{copy.empty.source}
					</a>
				</p>
			</section>
		</div>
	);
}
