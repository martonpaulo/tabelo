import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	ChevronDown,
	Download,
	FilePlus2,
	FolderOpen,
	Upload,
} from "lucide-react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// File operations share one explicit document-level entry point. Downloading
// opens the chooser rather than firing immediately, because a format is not
// the only choice a download has to make — see ui/download-dialog.tsx.

export function FileMenu({
	onImport,
	onDownload,
}: {
	readonly onImport: () => void;
	readonly onDownload: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" size="sm" aria-label={copy.actions.file} />
				}
			>
				<FolderOpen aria-hidden />
				<span className="font-medium">{copy.actions.file}</span>
				<ChevronDown aria-hidden className="opacity-60" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={() => useTabeloStore.getState().resetDocument()}
					>
						<FilePlus2 aria-hidden />
						{copy.actions.newTable}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onImport}>
						<Upload aria-hidden />
						{copy.actions.importFile}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={onDownload}>
						<Download aria-hidden />
						{copy.actions.downloadTable}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
