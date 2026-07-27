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
	Check,
	ChevronDown,
	ClipboardCopy,
	MoreHorizontal,
} from "lucide-react";
import { writeClipboardText } from "@/platform/files";
import { textForView, useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { listViews } from "@/views/registry";
import type { ViewDefinition } from "@/views/types";

interface PaneControlProps {
	readonly paneId: string;
	readonly view: ViewDefinition;
	readonly compact: boolean;
}

export function PaneIdentity({
	view,
	compact,
}: Omit<PaneControlProps, "paneId">) {
	const Icon = view.icon;

	return (
		<h2 className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
			<Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
			<span className="truncate">{compact ? view.shortLabel : view.label}</span>
		</h2>
	);
}

export function PaneMenu({ paneId, view }: PaneControlProps) {
	const views = listViews();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						aria-label={`${copy.workspace.paneActions}: ${view.label}`}
					/>
				}
			>
				<MoreHorizontal aria-hidden />
				<span className="font-medium">{copy.workspace.pane}</span>
				<ChevronDown aria-hidden className="opacity-60" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{copy.workspace.changeView}</DropdownMenuLabel>
					{views.map((candidate) => (
						<DropdownMenuItem
							key={candidate.id}
							onClick={() =>
								useTabeloStore.getState().setPaneView(paneId, candidate.id)
							}
						>
							<candidate.icon aria-hidden />
							<span className="flex-1">
								<span className="block font-medium">{candidate.label}</span>
								<span className="block text-muted-foreground text-xs">
									{candidate.description}
								</span>
							</span>
							{candidate.id === view.id ? (
								<Check aria-hidden className="opacity-70" />
							) : null}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>

				{view.kind === "source" ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={async () => {
								const state = useTabeloStore.getState();
								const source =
									state.draft?.paneId === paneId &&
									state.draft.viewId === view.id
										? state.draft.text
										: textForView(state.document, view.id);
								if (await writeClipboardText(source)) {
									state.setNotice(copy.notices.sourceCopied);
								}
							}}
						>
							<ClipboardCopy aria-hidden />
							{copy.actions.copySource}
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
