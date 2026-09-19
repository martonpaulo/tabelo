import { IconColumns, IconTextWrap } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import {
	LINE_BREAK_GLYPH,
	SPACE_GLYPH,
	TAB_GLYPH,
} from "@/ui/source/indicator-glyphs";
import type { SourceDisplayKey } from "@/workspace/source-display";

// The mark a display setting draws, shown as its icon, so a settings row and
// what a source pane draws can be matched by eye. One fixed slot, as wide as
// the widest mark, so every row's label starts on the same line (owner,
// 2026-09-19). Wrapping draws no mark, so its slot holds the wrap icon. Settings
// and a pane's own display dialog both draw their rows with it.
export function DisplayGlyph({
	setting,
}: {
	readonly setting: SourceDisplayKey;
}) {
	return (
		<span
			aria-hidden
			className="flex h-7 w-12 shrink-0 items-center justify-center rounded-indicator bg-surface-app font-source text-muted-foreground text-xs"
		>
			{glyphs[setting]}
		</span>
	);
}

const glyphs: Record<SourceDisplayKey, ReactNode> = {
	wrap: <IconTextWrap aria-hidden className="size-4" />,
	spaceIndicators: SPACE_GLYPH,
	tabIndicators: TAB_GLYPH,
	emptyValueIndicators: EMPTY_VALUE_PLACEHOLDER,
	lineBreakIndicators: LINE_BREAK_GLYPH,
	alignColumns: <IconColumns aria-hidden className="size-4" />,
	// The spelling the setting writes, as the mark of a setting that draws
	// nothing.
	lineBreakTags: "<br>",
};
