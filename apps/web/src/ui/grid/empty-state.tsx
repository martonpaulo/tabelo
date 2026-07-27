import { Button } from "@tabelo/ui/components/button";
import { ClipboardPaste, Upload } from "lucide-react";
import { readClipboardTable } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { importTableFile } from "@/ui/import";

// Shown beneath the grid rather than over it, so the table stays usable: the
// fastest way out of the empty state is still to type in a cell.

export function EmptyState() {
	return (
		<div className="flex justify-start px-4 py-6">
			<div className="max-w-md border border-line-subtle bg-surface-header p-4">
				<h3 className="font-medium text-sm">{copy.empty.title}</h3>
				<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
					{copy.empty.body}
				</p>
				<div className="mt-3 flex flex-wrap gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onClick={async () => {
							const payload = await readClipboardTable();
							if (payload) useTabeloStore.getState().pasteClipboard(payload);
						}}
					>
						<ClipboardPaste aria-hidden />
						{copy.empty.pasteHint}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void importTableFile()}
					>
						<Upload aria-hidden />
						{copy.empty.importAction}
					</Button>
				</div>
			</div>
		</div>
	);
}
