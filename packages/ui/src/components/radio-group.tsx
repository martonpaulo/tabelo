import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import {
	singleSelectionIndicatorFillStyles,
	singleSelectionIndicatorShapeStyles,
} from "@tabelo/ui/components/menu-styles";
import { cn } from "@tabelo/ui/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
	return (
		<RadioGroupPrimitive
			data-slot="radio-group"
			className={cn("grid w-full gap-2", className)}
			{...props}
		/>
	);
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
	return (
		<RadioPrimitive.Root
			data-slot="radio-group-item"
			className={cn(
				singleSelectionIndicatorShapeStyles,
				"group/radio-group-item peer aspect-square cursor-pointer border-input outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-disabled:cursor-not-allowed data-checked:border-primary data-disabled:opacity-50 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		>
			<RadioPrimitive.Indicator
				data-slot="radio-group-indicator"
				className={singleSelectionIndicatorFillStyles}
			/>
		</RadioPrimitive.Root>
	);
}

export { RadioGroup, RadioGroupItem };
