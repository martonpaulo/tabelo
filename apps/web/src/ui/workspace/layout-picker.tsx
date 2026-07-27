import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { cn } from "@tabelo/ui/lib/utils";
import { LayoutGrid } from "lucide-react";
import { copy } from "@/ui/copy";
import {
	gridAreaOf,
	type LayoutId,
	type LayoutPreset,
	layoutPresets,
} from "@/workspace/layout";

// Layout is picked from a small set of presets rather than by assigning slots
// one at a time. Each option draws itself, so the shape is understood before
// it is applied — no preview mode, no explanation needed.

function LayoutGlyph({
	preset,
	active,
}: {
	readonly preset: LayoutPreset;
	readonly active: boolean;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-6 shrink-0 grid-cols-2 grid-rows-2 gap-px border p-px",
				active ? "border-selection-edge" : "border-muted-foreground/50",
			)}
		>
			{preset.panes.map((slots) => {
				const area = gridAreaOf(slots);
				return (
					<span
						key={slots.join("")}
						className={active ? "bg-selection-edge" : "bg-muted-foreground/50"}
						style={{
							gridArea: `${area.rowStart} / ${area.columnStart} / ${area.rowEnd} / ${area.columnEnd}`,
						}}
					/>
				);
			})}
		</span>
	);
}

interface LayoutPickerProps {
	readonly value: LayoutId;
	readonly onChange: (layout: LayoutId) => void;
}

export function LayoutPicker({ value, onChange }: LayoutPickerProps) {
	const active =
		layoutPresets.find((preset) => preset.id === value) ?? layoutPresets[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						aria-label={`${copy.workspace.layout}: ${active.label}`}
					/>
				}
			>
				<LayoutGrid aria-hidden />
				<span className="font-medium">{copy.workspace.layout}</span>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-auto min-w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{copy.workspace.layoutHint}</DropdownMenuLabel>
					{layoutPresets.map((preset) => (
						<DropdownMenuItem
							key={preset.id}
							onClick={() => onChange(preset.id)}
						>
							<LayoutGlyph preset={preset} active={preset.id === value} />
							<span className="flex-1">
								<span className="block font-medium">{preset.label}</span>
								<span className="block text-muted-foreground text-xs">
									{preset.description}
								</span>
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
