import { Button } from "@tabelo/ui/components/button";
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
import { IconSettings } from "@tabler/icons-react";
import { lazy, Suspense, useId, useState } from "react";
import { copy } from "@/copy/copy";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import {
	DEFAULT_PREFERENCES,
	type Preferences,
	SPACE_INDICATOR_VALUES,
	type SpaceIndicators,
} from "@/preferences/contract";
import { preferencesStore } from "@/preferences/store";
import { usePreferences } from "@/preferences/use-preferences";
import { MenuOption } from "@/ui/primitives/menu-option";
import { SPACE_GLYPH, TAB_GLYPH } from "@/ui/source/indicator-glyphs";

// The preview is a real read-only source editor, so it waits for the editor
// chunk the same way a text view does.
const IndicatorPreview = lazy(() => import("@/ui/source/indicator-preview"));

// The mark a setting draws, shown as its icon, so the row and what the preview
// draws can be matched by eye.
function Glyph({ children }: { readonly children: string }) {
	return (
		<span
			aria-hidden
			className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-indicator bg-surface-app px-1.5 font-source text-muted-foreground text-xs"
		>
			{children}
		</span>
	);
}

function SwitchOption({
	glyph,
	label,
	description,
	checked,
	onCheckedChange,
}: {
	readonly glyph: string;
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly onCheckedChange: (checked: boolean) => void;
}) {
	const id = useId();
	return (
		<label htmlFor={id} className={cn(optionBlockStyles, "cursor-pointer")}>
			<Glyph>{glyph}</Glyph>
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
	const indicatorsLabelId = useId();
	const spaceLabelId = useId();
	const spaceDescriptionId = useId();

	const commit = (next: Preferences) => {
		setSaveError(preferencesStore.commit(next).status !== "saved");
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
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:w-md"
			>
				<DialogHeader>
					<DialogTitle id={titleId} className="flex items-center gap-2">
						<IconSettings aria-hidden className="size-5 text-selection-edge" />
						{copy.settings.title}
					</DialogTitle>
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

					<section className="grid gap-1.5" aria-labelledby={indicatorsLabelId}>
						<h3 id={indicatorsLabelId} className="mb-1 font-medium text-sm">
							{copy.settings.indicators.label}
						</h3>
						<SwitchOption
							glyph={EMPTY_VALUE_PLACEHOLDER}
							{...copy.settings.emptyValueIndicators}
							checked={preferences.emptyValueIndicators}
							onCheckedChange={(checked) =>
								update({ emptyValueIndicators: checked })
							}
						/>
						<SwitchOption
							glyph={TAB_GLYPH}
							{...copy.settings.tabIndicators}
							checked={preferences.tabIndicators}
							onCheckedChange={(checked) => update({ tabIndicators: checked })}
						/>
						<div className={cn(optionBlockStyles, "grid gap-3")}>
							<div className="flex items-center gap-3">
								<Glyph>{SPACE_GLYPH}</Glyph>
								<span className="grid min-w-0 flex-1 gap-0.5">
									<span id={spaceLabelId} className="font-medium">
										{copy.settings.spaceIndicators.label}
									</span>
									<span
										id={spaceDescriptionId}
										className="text-muted-foreground text-xs"
									>
										{
											copy.settings.spaceIndicators.options[
												preferences.spaceIndicators
											].description
										}
									</span>
								</span>
							</div>
							<SegmentedControl
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

				<div className="flex items-center justify-between gap-2">
					<Button
						variant="ghost"
						className="text-muted-foreground"
						onClick={() => commit(DEFAULT_PREFERENCES)}
					>
						{copy.settings.reset}
					</Button>
					<Button onClick={() => onOpenChange(false)}>
						{copy.settings.done}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
