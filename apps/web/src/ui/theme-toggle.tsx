import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

// Rewritten from the scaffold's version, which used arbitrary sizes and a
// cross-fading icon animation — both pattern breaks under
// docs/design-system.md §2 and §7.

const options = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const active = options.find((option) => option.value === theme) ?? options[2];
	const Icon = active.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Theme: ${active.label}`}
					/>
				}
			>
				<Icon aria-hidden />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto min-w-32">
				{options.map((option) => (
					<DropdownMenuItem
						key={option.value}
						onClick={() => setTheme(option.value)}
						className={theme === option.value ? "bg-accent/60" : undefined}
					>
						<option.icon aria-hidden />
						{option.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
