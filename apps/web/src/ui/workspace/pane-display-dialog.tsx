import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { optionBlockStyles } from "@tabelo/ui/components/menu-styles";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@tabelo/ui/components/segmented-control";
import { cn } from "@tabelo/ui/lib/utils";
import { useId } from "react";
import { copy } from "@/copy/copy";
import type { SourceDisplay } from "@/preferences/contract";
import { usePreferences } from "@/preferences/use-preferences";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogAlternative,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { MenuOption } from "@/ui/primitives/menu-option";
import { DisplayGlyph } from "@/ui/source/display-glyph";
import type { ViewDefinition } from "@/views/types";
import {
	INHERIT_SOURCE_DISPLAY,
	resolveSourceDisplay,
	type SourceDisplayKey,
	type SourceDisplayOverrides,
} from "@/workspace/source-display";
import {
	type DisplaySegment,
	explicitSegments,
	FOLLOW_DEFAULT,
	followsEveryDefault,
	offersSetting,
	overrideFromSegment,
	segmentOf,
} from "./pane-display-choices";

// Settings' own order, so a reader who knows one dialog knows the other.
const ROWS: readonly SourceDisplayKey[] = [
	"wrap",
	"alignColumns",
	"emptyValueIndicators",
	"tabIndicators",
	"lineBreakIndicators",
	"spaceIndicators",
	"lineBreakTags",
];

// The words a segment shows for one of a setting's own values.
function valueLabel(segment: Exclude<DisplaySegment, typeof FOLLOW_DEFAULT>) {
	if (segment === "on") return copy.paneDisplay.on;
	if (segment === "off") return copy.paneDisplay.off;
	return copy.settings.spaceIndicators.options[segment].label;
}

function settingText(key: SourceDisplayKey, resolved: SourceDisplay) {
	if (key === "spaceIndicators") {
		return {
			label: copy.settings.spaceIndicators.label,
			description:
				copy.settings.spaceIndicators.options[resolved.spaceIndicators]
					.description,
		};
	}
	return copy.settings[key];
}

function DisplayChoice({
	setting,
	defaults,
	overrides,
	onChoose,
}: {
	readonly setting: SourceDisplayKey;
	readonly defaults: SourceDisplay;
	readonly overrides: SourceDisplayOverrides;
	readonly onChoose: (segment: string) => void;
}) {
	const labelId = useId();
	const descriptionId = useId();
	const resolved = resolveSourceDisplay(defaults, overrides);
	const { label, description } = settingText(setting, resolved);
	const defaultSegment = segmentOf(defaults[setting]);
	const values = explicitSegments(setting);
	const manyValues = values.length > 2;

	return (
		<div className={cn(optionBlockStyles, "grid gap-3")}>
			<div className="flex items-center gap-3">
				<DisplayGlyph setting={setting} />
				<MenuOption
					labelId={labelId}
					descriptionId={descriptionId}
					label={label}
					description={description}
				/>
			</div>
			<SegmentedControl
				// Whenever the segments do not fit one row, the follow segment takes
				// a row of its own and the setting's own values share the next, so
				// following and choosing stay visibly apart: the five spacing
				// segments always, a switch's three below the small breakpoint.
				className={
					manyValues
						? "grid-flow-row grid-cols-2 sm:grid-cols-4"
						: "max-sm:grid-flow-row max-sm:grid-cols-2"
				}
				aria-labelledby={labelId}
				aria-describedby={descriptionId}
				value={segmentOf(overrides[setting])}
				onValueChange={(value) => onChoose(value as string)}
			>
				<SegmentedControlItem
					value={FOLLOW_DEFAULT}
					className={manyValues ? "col-span-full" : "max-sm:col-span-full"}
				>
					{copy.paneDisplay.followDefault(
						valueLabel(
							defaultSegment as Exclude<DisplaySegment, typeof FOLLOW_DEFAULT>,
						),
					)}
				</SegmentedControlItem>
				{values.map((segment) => (
					<SegmentedControlItem key={segment} value={segment}>
						{valueLabel(segment)}
					</SegmentedControlItem>
				))}
			</SegmentedControl>
		</div>
	);
}

// One source pane's display, set for that pane alone (#276, option C). Every
// setting follows the default in Settings until the pane chooses a value of
// its own, and the follow segment names the value it follows, so the dialog
// says which settings are the pane's own without a second marker. Choices
// apply as they are made, like Settings: the pane behind the dialog shows the
// effect, so there is nothing for an Apply step to confirm.
export function PaneDisplayDialog({
	paneId,
	view,
	open,
	onOpenChange,
	finalFocus,
}: {
	readonly paneId: string;
	readonly view: ViewDefinition;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly finalFocus: () => HTMLElement | null;
}) {
	const titleId = useId();
	const descriptionId = useId();
	const defaults = usePreferences();
	const overrides = useTabeloStore(
		(state) =>
			state.workspace.panes.find((pane) => pane.id === paneId) ??
			INHERIT_SOURCE_DISPLAY,
	);
	const setOverride = (key: SourceDisplayKey, segment: string) => {
		const value = overrideFromSegment(key, segment);
		if (value === undefined) return;
		useTabeloStore.getState().setPaneSourceDisplay(paneId, key, value);
	};
	const followsDefaults = followsEveryDefault(overrides);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				width="wide"
				finalFocus={finalFocus}
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.paneDisplay.title}</DialogTitle>
					<DialogDescription id={descriptionId}>
						{copy.paneDisplay.description(view.label)}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-1.5">
					{ROWS.filter((setting) => offersSetting(setting, view)).map(
						(setting) => (
							<DisplayChoice
								key={setting}
								setting={setting}
								defaults={defaults}
								overrides={overrides}
								onChoose={(segment) => setOverride(setting, segment)}
							/>
						),
					)}
				</div>

				<DialogActions>
					<DialogAlternative
						type="button"
						disabledReason={
							followsDefaults
								? copy.disabled.paneDisplayFollowsDefaults
								: undefined
						}
						onClick={() => {
							for (const setting of ROWS) {
								useTabeloStore
									.getState()
									.setPaneSourceDisplay(paneId, setting, null);
							}
						}}
					>
						{copy.paneDisplay.useDefaults}
					</DialogAlternative>
					<DialogConfirm type="button" onClick={() => onOpenChange(false)}>
						{copy.paneDisplay.done}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
