import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@tabelo/ui/components/dropdown-menu";
import { Fragment } from "react";
import { buildTableActions, type TableActionContext } from "./table-actions";

interface DropdownTableActionsProps {
	readonly axis: TableActionContext["axis"];
	readonly beforeRun?: () => void;
}

// The pane and axis menus expose the same action model through the same
// dropdown primitive. Keep that rendering here so disabled, destructive, icon,
// and shortcut treatment cannot drift between the two command surfaces.
export function DropdownTableActions({
	axis,
	beforeRun,
}: DropdownTableActionsProps) {
	return buildTableActions({ axis }).map((group, groupIndex) => (
		<Fragment key={group.id}>
			{groupIndex > 0 ? <DropdownMenuSeparator /> : null}
			{group.actions.map((action) => (
				<DropdownMenuItem
					key={action.id}
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
			))}
		</Fragment>
	));
}
