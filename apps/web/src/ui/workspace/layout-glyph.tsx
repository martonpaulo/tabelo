import { cn } from "@tabelo/ui/lib/utils";
import { gridAreaOf, type LayoutPreset, type SlotId } from "@/workspace/layout";

export function LayoutGlyph({
	preset,
	className,
	highlightSlots,
}: {
	readonly preset: LayoutPreset;
	readonly className?: string;
	readonly highlightSlots?: readonly SlotId[];
}) {
	return (
		<span
			className={cn(
				"grid size-6 grid-cols-2 grid-rows-2 gap-[0.0625rem] border border-muted-foreground/50 p-[0.0625rem]",
				className,
			)}
		>
			{preset.panes.map((slots) => {
				const area = gridAreaOf(slots);
				const highlighted =
					highlightSlots?.length === slots.length &&
					highlightSlots.every((slot) => slots.includes(slot));
				return (
					<span
						key={slots.join("")}
						className={cn(
							"bg-muted-foreground/50",
							highlighted && "bg-selection-edge",
						)}
						style={{
							gridArea: `${area.rowStart} / ${area.columnStart} / ${area.rowEnd} / ${area.columnEnd}`,
						}}
					/>
				);
			})}
		</span>
	);
}
