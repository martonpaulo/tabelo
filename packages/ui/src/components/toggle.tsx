import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const toggleVariants = cva(
	`group/toggle rounded-interactive not-aria-pressed:hover:bg-accent not-aria-pressed:hover:text-accent-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground dark:aria-invalid:ring-destructive/40 inline-flex cursor-pointer items-center justify-center gap-1 text-xs font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${controlStateTransitionStyles}`,
	{
		variants: {
			variant: {
				default: "bg-transparent",
				outline: "border-input border bg-transparent",
			},
			size: {
				default:
					"h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				sm: "rounded-interactive h-7 min-w-7 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
				lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Toggle({
	className,
	variant = "default",
	size = "default",
	...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive
			data-slot="toggle"
			className={cn(toggleVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Toggle, toggleVariants };
