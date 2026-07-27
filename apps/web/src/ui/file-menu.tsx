import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
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
import { listDownloadableCodecs } from "@/formats";
import { downloadText } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// File operations share one explicit document-level entry point. Download
// choices still come directly from the codec registry.

const BASE_FILENAME = "table";

export function FileMenu({ onImport }: { readonly onImport: () => void }) {
	const codecs = listDownloadableCodecs();

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
					<DropdownMenuLabel>{copy.actions.downloadAs}</DropdownMenuLabel>
					{codecs.map((codec) => (
						<DropdownMenuItem
							key={codec.id}
							onClick={() => {
								const document = useTabeloStore.getState().document;
								downloadText(
									`${BASE_FILENAME}.${codec.extension}`,
									codec.mimeType,
									codec.serialize(document),
								);
							}}
						>
							<Download aria-hidden />
							<span className="flex-1">{codec.label}</span>
							<span className="text-muted-foreground text-xs">
								.{codec.extension}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
