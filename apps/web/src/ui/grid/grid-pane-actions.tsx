import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { Fragment } from "react";
import { selectionRect } from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { buildTableActions } from "./table-actions";

// The grid pane's header carries the current selection and one menu holding
// every table action. Progressive disclosure: the common path is the context
// menu on the cell itself, and this is the discoverable route for anyone who
// has not tried right-clicking yet.

export function GridPaneActions({ compact }: { readonly compact: boolean }) {
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);

	const rect = selectionRect(
		selection,
		document.rows.length,
		document.columns.length,
	);
	const rows = rect.bottom - rect.top + 1;
	const columns = rect.right - rect.left + 1;

	return (
		<>
			{compact ? null : (
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{copy.a11y.selectionSummary(rows, columns)}
				</span>
			)}

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							aria-label={copy.actions.tableActions}
						/>
					}
				>
					<span className="font-medium">{copy.actions.tableActions}</span>
					<ChevronDown aria-hidden className="opacity-60" />
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-auto min-w-56">
					{buildTableActions({
						axis: selection.mode === "column" ? "column" : "cell",
					}).map((group, index) => (
						<Fragment key={group.id}>
							{index > 0 ? <DropdownMenuSeparator /> : null}
							{group.actions.map((action) => (
								<DropdownMenuItem
									key={action.id}
									disabled={action.disabled}
									variant={action.danger ? "destructive" : "default"}
									onClick={action.run}
								>
									<action.icon aria-hidden />
									{action.label}
									{action.shortcut ? (
										<DropdownMenuShortcut>
											{action.shortcut}
										</DropdownMenuShortcut>
									) : null}
								</DropdownMenuItem>
							))}
						</Fragment>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}
