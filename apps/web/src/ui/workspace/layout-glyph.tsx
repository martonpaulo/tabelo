import { cn } from "@tabelo/ui/lib/utils";
import { gridAreaOf, type LayoutPreset } from "@/workspace/layout";

export function LayoutGlyph({
	preset,
	className,
}: {
	readonly preset: LayoutPreset;
	readonly className?: string;
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
				return (
					<span
						key={slots.join("")}
						className="bg-muted-foreground/50"
						style={{
							gridArea: `${area.rowStart} / ${area.columnStart} / ${area.rowEnd} / ${area.columnEnd}`,
						}}
					/>
				);
			})}
		</span>
	);
}
