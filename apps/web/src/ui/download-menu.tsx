import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { Download } from "lucide-react";
import { listDownloadableCodecs } from "@/formats";
import { downloadText } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";

// Generated from the codec registry, never from a list kept in step by hand.
// Registering a format is the only thing needed for it to become downloadable.

const BASE_FILENAME = "table";

export function DownloadMenu() {
	const codecs = listDownloadableCodecs();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={copy.actions.download}
						title={copy.actions.download}
					/>
				}
			>
				<Download aria-hidden />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-48">
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
