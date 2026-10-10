import {
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@tabelo/ui/components/context-menu";
import type { TablerIcon } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { submenuRefusal } from "./submenu-refusal";

// One named group of table commands drawn as a submenu: Move, Sort, Fill, and
// Move focus, in the grid's context menu and in every source view's. When no
// row inside can run, the submenu itself is disabled with one reason of its
// own (#497): the trigger keeps its place and its keyboard stop, reports
// `aria-disabled`, opens on nothing, and carries the reason as its
// description and its tooltip. Disabled on the root rather than the trigger,
// because the root is what Base UI's list navigation reads before opening
// the submenu on ArrowRight.
export function CommandSubmenu({
	icon: Icon,
	label,
	rowReasons,
	children,
}: {
	readonly icon: TablerIcon;
	readonly label: string;
	// One entry per row, `undefined` for a row that can run.
	readonly rowReasons: readonly (string | undefined)[];
	readonly children: ReactNode;
}) {
	const refusal = submenuRefusal(rowReasons);
	return (
		<ContextMenuSub disabled={refusal !== undefined}>
			<ControlTooltip reason={refusal}>
				<ContextMenuSubTrigger>
					<Icon aria-hidden />
					{label}
				</ContextMenuSubTrigger>
			</ControlTooltip>
			<ContextMenuSubContent aria-label={label}>
				{children}
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}
