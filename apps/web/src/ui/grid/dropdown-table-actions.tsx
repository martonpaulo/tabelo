import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { Fragment } from "react";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import {
	buildTableActions,
	type TableAction,
	type TableActionContext,
} from "./table-actions";

interface DropdownTableActionsProps {
	readonly axis: TableActionContext["axis"];
	readonly beforeRun?: () => void;
}

// The pane and axis menus expose the same action model through the same
// dropdown primitive. Keep that rendering here so disabled, destructive, icon,
// shortcut, and submenu treatment cannot drift between the two command
// surfaces.
export function DropdownTableActions({
	axis,
	beforeRun,
}: DropdownTableActionsProps) {
	const item = (action: TableAction) => (
		<ControlTooltip
			key={action.id}
			reason={action.disabled ? action.disabledReason : undefined}
		>
			<DropdownMenuItem
				disabled={action.disabled}
				variant={action.danger ? "destructive" : "default"}
				onClick={() => {
					beforeRun?.();
					action.run();
				}}
			>
				<action.icon aria-hidden />
				{action.label}
				{action.shortcut ? (
					<DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
				) : null}
			</DropdownMenuItem>
		</ControlTooltip>
	);

	return buildTableActions({ axis }).map((group, groupIndex) => (
		<Fragment key={group.id}>
			{groupIndex > 0 ? <DropdownMenuSeparator /> : null}
			{group.submenu && group.label ? (
				<DropdownMenuGroup>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<group.submenu.icon aria-hidden />
							{group.label}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent aria-label={group.label}>
							{group.actions.map(item)}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuGroup>
			) : (
				<DropdownMenuGroup aria-labelledby={group.labelId}>
					{group.label && group.labelId ? (
						<DropdownMenuLabel id={group.labelId}>
							{group.label}
						</DropdownMenuLabel>
					) : null}
					{group.actions.map(item)}
				</DropdownMenuGroup>
			)}
		</Fragment>
	));
}
