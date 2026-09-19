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
import { Switch } from "@tabelo/ui/components/switch";
import { cn } from "@tabelo/ui/lib/utils";
import { lazy, Suspense, useId, useState } from "react";
import { copy } from "@/copy/copy";
import {
	DEFAULT_PREFERENCES,
	type Preferences,
	SPACE_INDICATOR_VALUES,
	type SpaceIndicators,
} from "@/preferences/contract";
import { preferencesStore } from "@/preferences/store";
import {
	usePreferences,
	usePreferencesIssue,
} from "@/preferences/use-preferences";
import {
	DialogActions,
	DialogAlternative,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { MenuOption } from "@/ui/primitives/menu-option";
import { DisplayGlyph } from "@/ui/source/display-glyph";
import type { SourceDisplayKey } from "@/workspace/source-display";

// The preview is a real read-only source editor, so it waits for the editor
// chunk the same way a text view does.
const IndicatorPreview = lazy(() => import("@/ui/source/indicator-preview"));

function SwitchOption({
	setting,
	label,
	description,
	checked,
	onCheckedChange,
}: {
	readonly setting: SourceDisplayKey;
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly onCheckedChange: (checked: boolean) => void;
}) {
	const id = useId();
	return (
		<label htmlFor={id} className={cn(optionBlockStyles, "cursor-pointer")}>
			<DisplayGlyph setting={setting} />
			<MenuOption label={label} description={description} />
			<Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
		</label>
	);
}

// Settings apply as they are changed: the preview shows the effect before the
// dialog closes, so there is nothing left for an Apply step to confirm
// (owner decision, 2026-09-18). A write the browser refuses is reported in
// place and the controls fall back to what was actually saved.
export function SettingsDialog({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const preferences = usePreferences();
	const [saveError, setSaveError] = useState(false);
	const titleId = useId();
	const descriptionId = useId();
	const displayLabelId = useId();
	const spaceLabelId = useId();
	const spaceDescriptionId = useId();

	// While the stored settings are unreadable a change applies for the session
	// and is not written, which the line below the controls already says, so
	// it is not reported again as a failed write.
	const sessionOnly = usePreferencesIssue() !== null;
	const commit = (next: Preferences) => {
		const { status } = preferencesStore.commit(next);
		setSaveError(status !== "saved" && status !== "blocked");
	};
	const update = (change: Partial<Preferences>) =>
		commit({ ...preferences, ...change });

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) return;
				setSaveError(false);
				onOpenChange(false);
			}}
		>
			<DialogContent
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				width="wide"
				className="grid-rows-[auto_minmax(0,1fr)_auto]"
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.settings.title}</DialogTitle>
					<DialogDescription id={descriptionId}>
						{copy.settings.description}
					</DialogDescription>
				</DialogHeader>

				<div
					data-slot="settings-body"
					className="grid min-h-0 content-start gap-4 overflow-y-auto overflow-x-hidden"
				>
					<div className="grid gap-1.5">
						<p className="text-muted-foreground text-xs">
							{copy.settings.previewLabel}
						</p>
						<Suspense
							fallback={
								<div className="h-24 rounded-interactive bg-surface-app" />
							}
						>
							<IndicatorPreview
								preferences={preferences}
								label={copy.settings.preview}
							/>
						</Suspense>
					</div>

					{/* The four global defaults a source pane follows until it makes
					    its own choice (#276). */}
					<section className="grid gap-1.5" aria-labelledby={displayLabelId}>
						<h3 id={displayLabelId} className="mb-1 font-medium text-sm">
							{copy.settings.display.label}
						</h3>
						<SwitchOption
							setting="wrap"
							{...copy.settings.wrap}
							checked={preferences.wrap}
							onCheckedChange={(checked) => update({ wrap: checked })}
						/>
						<SwitchOption
							setting="emptyValueIndicators"
							{...copy.settings.emptyValueIndicators}
							checked={preferences.emptyValueIndicators}
							onCheckedChange={(checked) =>
								update({ emptyValueIndicators: checked })
							}
						/>
						<SwitchOption
							setting="tabIndicators"
							{...copy.settings.tabIndicators}
							checked={preferences.tabIndicators}
							onCheckedChange={(checked) => update({ tabIndicators: checked })}
						/>
						<div className={cn(optionBlockStyles, "grid gap-3")}>
							<div className="flex items-center gap-3">
								<DisplayGlyph setting="spaceIndicators" />
								<MenuOption
									labelId={spaceLabelId}
									descriptionId={spaceDescriptionId}
									label={copy.settings.spaceIndicators.label}
									description={
										copy.settings.spaceIndicators.options[
											preferences.spaceIndicators
										].description
									}
								/>
							</div>
							<SegmentedControl
								// Four labels of two words do not fit one row below the
								// small breakpoint, so they form two rows of two there
								// rather than wrapping inside a segment.
								className="max-sm:grid-flow-row max-sm:grid-cols-2"
								aria-labelledby={spaceLabelId}
								aria-describedby={spaceDescriptionId}
								value={preferences.spaceIndicators}
								onValueChange={(value) =>
									update({ spaceIndicators: value as SpaceIndicators })
								}
							>
								{SPACE_INDICATOR_VALUES.map((mode) => (
									<SegmentedControlItem key={mode} value={mode}>
										{copy.settings.spaceIndicators.options[mode].label}
									</SegmentedControlItem>
								))}
							</SegmentedControl>
						</div>
					</section>
				</div>

				{saveError ? (
					<p role="alert" className="text-destructive text-sm">
						{copy.settings.saveError}
					</p>
				) : null}
				{sessionOnly ? (
					<p className="text-muted-foreground text-sm">
						{copy.settings.sessionOnly}
					</p>
				) : null}

				{/* The shared action row: an ordinary alternative, then the one
				    decisive action last, stacking at full width on a phone like
				    every other dialog's footer (owner, 2026-09-19). */}
				<DialogActions>
					<DialogAlternative
						type="button"
						onClick={() => commit(DEFAULT_PREFERENCES)}
					>
						{copy.settings.reset}
					</DialogAlternative>
					<DialogConfirm type="button" onClick={() => onOpenChange(false)}>
						{copy.settings.done}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
