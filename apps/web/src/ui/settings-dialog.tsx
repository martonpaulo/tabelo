import { Checkbox } from "@tabelo/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Label } from "@tabelo/ui/components/label";
import {
	Brackets,
	Ellipsis,
	EyeOff,
	Monitor,
	Moon,
	PilcrowRight,
	Sun,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { copy } from "@/copy/copy";
import {
	type Preferences,
	SPACE_INDICATOR_VALUES,
	type SpaceIndicators,
	THEME_VALUES,
	type ThemePreference,
} from "@/preferences/contract";
import { preferencesStore } from "@/preferences/store";
import { applyThemePreference } from "@/preferences/theme";
import { usePreferences } from "@/preferences/use-preferences";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import {
	SingleSelectionList,
	SingleSelectionOption,
} from "@/ui/primitives/single-selection-list";

const themeIcons = {
	system: Monitor,
	light: Sun,
	dark: Moon,
} as const;

const spaceIndicatorIcons = {
	none: EyeOff,
	// Brackets for the padding around a value, a pilcrow pointing at where a
	// line ends, and an ellipsis for a row of dots all the way across.
	boundary: Brackets,
	trailing: PilcrowRight,
	all: Ellipsis,
} as const;

// One row treatment for the indicator switches, so both read as the same kind
// of choice as the option rows above them.
function IndicatorToggle({
	label,
	description,
	checked,
	onCheckedChange,
}: {
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<Label className="flex min-h-control-md items-center gap-3 text-sm leading-snug">
			<span className="grid flex-1 gap-0.5">
				<span className="font-medium">{label}</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</span>
			<Checkbox checked={checked} onCheckedChange={onCheckedChange} />
		</Label>
	);
}

function preferencesMatch(left: Preferences, right: Preferences): boolean {
	return (
		left.theme === right.theme &&
		left.spaceIndicators === right.spaceIndicators &&
		left.tabIndicators === right.tabIndicators &&
		left.emptyValueIndicators === right.emptyValueIndicators
	);
}

export function SettingsDialog({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const committed = usePreferences();
	const [draft, setDraft] = useState<Preferences>(committed);
	const [saveError, setSaveError] = useState(false);
	const titleId = useId();
	const descriptionId = useId();
	const themeLabelId = useId();
	const indicatorsLabelId = useId();
	const spaceLabelId = useId();

	useEffect(() => {
		if (!open) return;
		setDraft(committed);
		setSaveError(false);
		applyThemePreference(committed.theme, { suppressTransitions: true });
	}, [committed, open]);

	const updateDraft = (change: Partial<Preferences>) => {
		setSaveError(false);
		setDraft((current) => ({ ...current, ...change }));
	};

	const updateTheme = (theme: ThemePreference) => {
		setSaveError(false);
		setDraft((current) => ({ ...current, theme }));
		applyThemePreference(theme, { suppressTransitions: true });
	};

	const close = (nextOpen: boolean) => {
		if (nextOpen) return;
		applyThemePreference(preferencesStore.getSnapshot().theme, {
			suppressTransitions: true,
		});
		setSaveError(false);
		onOpenChange(false);
	};

	const apply = () => {
		const outcome = preferencesStore.commit(draft);
		if (outcome.status === "saved") {
			onOpenChange(false);
			return;
		}
		const previous = preferencesStore.getSnapshot();
		setDraft(previous);
		applyThemePreference(previous.theme, { suppressTransitions: true });
		setSaveError(true);
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:w-md"
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.settings.title}</DialogTitle>
					<DialogDescription id={descriptionId}>
						{copy.settings.description}
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 divide-y divide-line-subtle overflow-y-auto">
					<section className="grid gap-2 pb-4" aria-labelledby={themeLabelId}>
						<div>
							<h3 id={themeLabelId} className="font-medium text-sm">
								{copy.settings.theme.label}
							</h3>
							<p className="text-muted-foreground text-xs">
								{copy.settings.theme.description}
							</p>
						</div>
						<SingleSelectionList
							aria-labelledby={themeLabelId}
							value={draft.theme}
							onValueChange={(value) => updateTheme(value as ThemePreference)}
						>
							{THEME_VALUES.map((theme) => {
								const Icon = themeIcons[theme];
								return (
									<SingleSelectionOption
										key={theme}
										value={theme}
										selected={draft.theme === theme}
										icon={<Icon />}
										{...copy.settings.theme.options[theme]}
									/>
								);
							})}
						</SingleSelectionList>
					</section>

					<section
						className="grid gap-4 pt-4"
						aria-labelledby={indicatorsLabelId}
					>
						<div>
							<h3 id={indicatorsLabelId} className="font-medium text-sm">
								{copy.settings.indicators.label}
							</h3>
							<p className="text-muted-foreground text-xs">
								{copy.settings.indicators.description}
							</p>
						</div>

						{/* Three separate choices rather than one switch: a tab is a
						    delimiter, the placeholder reports a value, and spaces are
						    the only one a reader has an opinion about. The two answered
						    by yes or no come first, so the list that scrolls is the one
						    that visibly continues. */}
						<IndicatorToggle
							{...copy.settings.tabIndicators}
							checked={draft.tabIndicators}
							onCheckedChange={(checked) =>
								updateDraft({ tabIndicators: checked })
							}
						/>
						<IndicatorToggle
							{...copy.settings.emptyValueIndicators}
							checked={draft.emptyValueIndicators}
							onCheckedChange={(checked) =>
								updateDraft({ emptyValueIndicators: checked })
							}
						/>

						<div className="grid gap-2">
							<h4 id={spaceLabelId} className="text-muted-foreground text-xs">
								{copy.settings.spaceIndicators.label}
							</h4>
							<SingleSelectionList
								aria-labelledby={spaceLabelId}
								value={draft.spaceIndicators}
								onValueChange={(value) =>
									updateDraft({ spaceIndicators: value as SpaceIndicators })
								}
							>
								{SPACE_INDICATOR_VALUES.map((mode) => {
									const Icon = spaceIndicatorIcons[mode];
									return (
										<SingleSelectionOption
											key={mode}
											value={mode}
											selected={draft.spaceIndicators === mode}
											icon={<Icon />}
											{...copy.settings.spaceIndicators.options[mode]}
										/>
									);
								})}
							</SingleSelectionList>
						</div>
					</section>
				</div>

				{saveError ? (
					<p role="alert" className="text-destructive text-sm">
						{copy.settings.saveError}
					</p>
				) : null}

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						disabledReason={
							preferencesMatch(draft, committed)
								? copy.disabled.settingsAlreadyApplied
								: undefined
						}
						onClick={apply}
					>
						{copy.settings.apply}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
