import {
	ToggleGroup,
	ToggleGroupItem,
} from "@tabelo/ui/components/toggle-group";

// The format switch is the one control that must be readable at a glance, so
// both options stay visible instead of hiding behind a dropdown. Built on the
// shared ToggleGroup, which already handles roving focus and arrow-key
// movement — see docs/design-system.md §3.

export interface FormatOption<T extends string> {
	readonly value: T;
	readonly label: string;
}

interface FormatSwitchProps<T extends string> {
	readonly label: string;
	readonly value: T;
	readonly options: readonly FormatOption<T>[];
	readonly onChange: (value: T) => void;
}

export function FormatSwitch<T extends string>({
	label,
	value,
	options,
	onChange,
}: FormatSwitchProps<T>) {
	return (
		<ToggleGroup
			aria-label={label}
			variant="outline"
			size="sm"
			spacing={0}
			value={[value]}
			onValueChange={(next) => {
				// Base UI reports an empty array when the active item is pressed
				// again. Ignore it: there is no "no format" state to fall into.
				const picked = next[0] as T | undefined;
				if (picked) onChange(picked);
			}}
		>
			{options.map((option) => (
				<ToggleGroupItem key={option.value} value={option.value}>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
