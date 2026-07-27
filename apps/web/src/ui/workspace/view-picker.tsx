import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { copy } from "@/ui/copy";
import { listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";

// The pane's own view selector. Driven entirely by the registry, so a new view
// appears here the moment it is registered.

interface ViewPickerProps {
	readonly value: ViewId;
	readonly onChange: (view: ViewId) => void;
	readonly compact: boolean;
}

export function ViewPicker({ value, onChange, compact }: ViewPickerProps) {
	const views = listViews();
	const active = views.find((view) => view.id === value) ?? views[0];
	const Icon = active.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						aria-label={`${copy.workspace.chooseView}: ${active.label}`}
					/>
				}
			>
				<Icon aria-hidden />
				<span className="font-medium">
					{compact ? active.shortLabel : active.label}
				</span>
				<ChevronDown aria-hidden className="opacity-60" />
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" className="w-auto min-w-60">
				{views.map((view) => (
					<DropdownMenuItem key={view.id} onClick={() => onChange(view.id)}>
						<view.icon aria-hidden />
						<span className="flex-1">
							<span className="block font-medium">{view.label}</span>
							<span className="block text-muted-foreground text-xs">
								{view.description}
							</span>
						</span>
						{view.id === active.id ? (
							<Check aria-hidden className="opacity-70" />
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
