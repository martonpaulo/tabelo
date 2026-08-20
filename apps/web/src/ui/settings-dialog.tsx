import { Checkbox } from "@tabelo/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Label } from "@tabelo/ui/components/label";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { copy } from "@/copy/copy";
import {
	type Preferences,
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

function preferencesMatch(left: Preferences, right: Preferences): boolean {
	return (
		left.theme === right.theme &&
		left.showWhitespaceIndicators === right.showWhitespaceIndicators
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

	useEffect(() => {
		if (!open) return;
		setDraft(committed);
		setSaveError(false);
		applyThemePreference(committed.theme, { suppressTransitions: true });
	}, [committed, open]);

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
				className="sm:w-md"
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.settings.title}</DialogTitle>
					<DialogDescription id={descriptionId}>
						{copy.settings.description}
					</DialogDescription>
				</DialogHeader>

				<div className="divide-y divide-line-subtle">
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

					<Label className="flex min-h-control-md items-center gap-3 py-4 text-sm leading-snug">
						<span className="grid flex-1 gap-0.5">
							<span className="font-medium">
								{copy.settings.whitespaceIndicators.label}
							</span>
							<span className="text-muted-foreground text-xs">
								{copy.settings.whitespaceIndicators.description}
							</span>
						</span>
						<Checkbox
							checked={draft.showWhitespaceIndicators}
							onCheckedChange={(checked) => {
								setSaveError(false);
								setDraft((current) => ({
									...current,
									showWhitespaceIndicators: checked,
								}));
							}}
						/>
					</Label>
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
