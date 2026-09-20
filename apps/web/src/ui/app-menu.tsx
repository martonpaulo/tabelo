import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { menuItemInsetStyles } from "@tabelo/ui/components/menu-styles";
import { cn } from "@tabelo/ui/lib/utils";
import {
	IconAdjustmentsHorizontal,
	IconArrowBackUp,
	IconArrowForwardUp,
	IconArrowsExchange,
	IconBrandGithub,
	IconCheck,
	IconClipboardCopy,
	IconDots,
	IconDownload,
	IconFilePlus,
	IconFileText,
	IconLayoutGrid,
	IconLayoutSidebarRightExpand,
	IconPencil,
	IconRefresh,
	IconTableMinus,
	IconTrash,
} from "@tabler/icons-react";
import {
	type RefObject,
	useId,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { copy } from "@/copy/copy";
import { product } from "@/copy/product";
import { deleteEmptyRowsAndColumns } from "@/core/operations";
import {
	isLargeLibrary,
	type TableEntry,
	tableMarkClass,
} from "@/core/table-library";
import {
	canRunHistory,
	getHistoryRevision,
	runHistory,
	subscribeHistory,
} from "@/history/coordinator";
import type { PwaUpdate } from "@/pwa/use-pwa-update";
import { transposeLimitError, useTabeloStore } from "@/state/store";
import { TransposeTypeChangeDialog } from "@/ui/grid/cell-type-change-dialog";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { MenuOption } from "@/ui/primitives/menu-option";
import { useContentWhileOpen } from "@/ui/primitives/use-content-while-open";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import { useStackedWorkspace } from "@/ui/workspace/stacking";
import {
	layoutsForPaneCount,
	paneCapacity,
	splitOptions,
} from "@/workspace/layout";

interface AppMenuProps {
	readonly onCopy: () => void;
	readonly onDownload: () => void;
	readonly onLayout: () => void;
	readonly onSettings: () => void;
	readonly onAddView: () => void;
	readonly onNewTable: () => void;
	readonly onDeleteTable: (tableId: string) => void;
	readonly onRename: (tableId: string) => void;
	readonly pwaUpdate: PwaUpdate;
	readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function AppMenu({
	onCopy,
	onDownload,
	onLayout,
	onSettings,
	onAddView,
	onNewTable,
	onDeleteTable,
	onRename,
	pwaUpdate,
	triggerRef,
}: AppMenuProps) {
	const menuDialog = useMenuDialogCommand();
	// A transpose waiting for the user to agree that the first column's typed
	// values become header text (#235): how many there are, or null.
	const [pendingTranspose, setPendingTranspose] = useState<number | null>(null);
	const tablesLabelId = useId();
	const workspaceLabelId = useId();
	const openTableLabelId = useId();
	const canUndoDocument = useTabeloStore((state) => state.past.length > 0);
	const library = useTabeloStore((state) => state.library);
	const tableName = useTabeloStore((state) => state.name);
	// The app always shows a table, so the only one left cannot be deleted.
	// Library order, always: a table keeps its place when it is opened, so the
	// list never rearranges under the pointer that just chose from it (owner,
	// 2026-09-20).
	const listedTables = library.tables.map((table, position) => ({
		table,
		position,
	}));
	const deleteRefusal =
		library.tables.length > 1 ? undefined : copy.disabled.deleteLastTable;
	const columnCount = useTabeloStore((state) => state.document.columns.length);
	const rowCount = useTabeloStore((state) => state.document.rows.length);
	const canRedoDocument = useTabeloStore((state) => state.future.length > 0);
	const activePaneId = useTabeloStore((state) => state.workspace.activePaneId);
	const stacked = useStackedWorkspace();
	// Why Add view is refused, if it is: the presets tile no more panes, or the
	// window is too narrow for another one. The narrow cap only ever stops a
	// workspace from growing; see paneCapacity.
	const addViewRefusal = useTabeloStore((state) => {
		if (splitOptions(state.workspace, paneCapacity(stacked)).length > 0) {
			return undefined;
		}
		return splitOptions(state.workspace).length > 0
			? copy.disabled.addViewNarrow
			: copy.disabled.addViewMaximum;
	});
	// One pane and four panes each have a single arrangement, so there is nothing
	// for the dialog to offer. The command stays in place, disabled and explained,
	// rather than appearing and disappearing as the pane count changes.
	const canChangeLayout = useTabeloStore(
		(state) => layoutsForPaneCount(state.workspace.panes.length).length > 1,
	);
	useSyncExternalStore(
		subscribeHistory,
		getHistoryRevision,
		getHistoryRevision,
	);
	const canUndo = canRunHistory(activePaneId, "undo", canUndoDocument);
	const canRedo = canRunHistory(activePaneId, "redo", canRedoDocument);

	const run = (direction: "undo" | "redo") =>
		runHistory(activePaneId, direction, () => {
			const state = useTabeloStore.getState();
			if (direction === "undo") state.undo();
			else state.redo();
		});
	// A command run from the menu changes what the menu shows, the table's size
	// and whether Undo is available, while the menu is still fading out. It
	// keeps what it showed while open until it has gone.
	const content = useContentWhileOpen(
		menuDialog.open,
		<DropdownMenuContent
			aria-label={copy.actions.openAppMenu}
			align="end"
			side="top"
			className="w-auto min-w-64 max-w-screen-fit-w"
		>
			{/* Three named sections, so the reader sees what a command acts on
			    before reading the command: the library, the open table, and the
			    workspace around it (owner, 2026-09-20). The product's own name is
			    not one of them: the trigger is the logo, and a row repeating it
			    named nothing. */}
			<DropdownMenuGroup aria-labelledby={tablesLabelId}>
				<DropdownMenuLabel id={tablesLabelId}>
					{copy.menuSections.tables}
				</DropdownMenuLabel>
				{/* Past the size where one list reads comfortably it scrolls, and
				    only the list does: New table and the note below it stay where
				    the reader left them (#403). */}
				<div className="max-h-56 overflow-y-auto">
					{listedTables.map(({ table, position }) => (
						<TableRow
							key={table.id}
							table={table}
							position={position}
							active={table.id === library.activeId}
							size={copy.workspace.tableSize(columnCount, rowCount)}
							deleteRefusal={deleteRefusal}
							onOpen={() =>
								menuDialog.runAfterClose(() =>
									useTabeloStore.getState().switchTable(table.id),
								)
							}
							onRename={() =>
								menuDialog.runAfterClose(() => onRename(table.id))
							}
							onDelete={() =>
								menuDialog.runAfterClose(() => onDeleteTable(table.id))
							}
						/>
					))}
				</div>
				{/* Adding a table belongs where the tables are, right after the
				    last one, rather than in the group of file commands below
				    (owner, 2026-09-20). */}
				<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onNewTable)}>
					<IconFilePlus aria-hidden />
					{copy.actions.newTable}
				</DropdownMenuItem>
				{isLargeLibrary(library) ? (
					<p
						className={cn("text-muted-foreground text-xs", menuItemInsetStyles)}
					>
						{copy.status.largeLibrary}
					</p>
				) : null}
			</DropdownMenuGroup>

			{pwaUpdate.ready ? (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<ControlTooltip
							reason={
								pwaUpdate.updating ? copy.disabled.updateInProgress : undefined
							}
						>
							<DropdownMenuItem
								disabled={pwaUpdate.updating}
								onClick={pwaUpdate.apply}
							>
								<IconRefresh aria-hidden />
								<MenuOption {...copy.appUpdate} />
							</DropdownMenuItem>
						</ControlTooltip>
					</DropdownMenuGroup>
				</>
			) : null}

			<DropdownMenuSeparator />
			<DropdownMenuGroup aria-labelledby={openTableLabelId}>
				<DropdownMenuLabel id={openTableLabelId} className="truncate">
					{tableName}
				</DropdownMenuLabel>
				{/* Undo and redo side by side: two halves of one control. */}
				<div className="mx-1 grid grid-cols-2 gap-1">
					<ControlTooltip reason={canUndo ? undefined : copy.disabled.undo}>
						<DropdownMenuItem
							disabled={!canUndo}
							onClick={() => run("undo")}
							className="justify-center bg-muted"
						>
							<IconArrowBackUp aria-hidden />
							{copy.actions.undo}
							<DropdownMenuShortcut className="ml-0">
								{copy.shortcuts.undo}
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					</ControlTooltip>
					<ControlTooltip reason={canRedo ? undefined : copy.disabled.redo}>
						<DropdownMenuItem
							disabled={!canRedo}
							onClick={() => run("redo")}
							className="justify-center bg-muted"
						>
							<IconArrowForwardUp aria-hidden />
							{copy.actions.redo}
							<DropdownMenuShortcut className="ml-0">
								{copy.shortcuts.redo}
							</DropdownMenuShortcut>
						</DropdownMenuItem>
					</ControlTooltip>
				</div>
				{/* The open table's own commands, under its name. Naming the
				    section after the table is what says which table they act on,
				    without a flyout per row (owner, 2026-09-20). */}
				<TableStructureCommands
					onConfirmTranspose={(typedValues) =>
						menuDialog.runAfterClose(() => setPendingTranspose(typedValues))
					}
				/>
				<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onCopy)}>
					<IconClipboardCopy aria-hidden />
					{copy.actions.copyTable}
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onDownload)}>
					<IconDownload aria-hidden />
					{copy.actions.downloadTable}
				</DropdownMenuItem>
			</DropdownMenuGroup>

			<DropdownMenuSeparator />
			<DropdownMenuGroup aria-labelledby={workspaceLabelId}>
				<DropdownMenuLabel id={workspaceLabelId}>
					{copy.menuSections.workspace}
				</DropdownMenuLabel>
				<ControlTooltip reason={addViewRefusal}>
					<DropdownMenuItem
						disabled={addViewRefusal !== undefined}
						onClick={() => menuDialog.runAfterClose(onAddView)}
					>
						<IconLayoutSidebarRightExpand aria-hidden />
						{copy.workspace.addView}
					</DropdownMenuItem>
				</ControlTooltip>
				<ControlTooltip
					reason={
						canChangeLayout ? undefined : copy.disabled.layoutOnlyArrangement
					}
				>
					<DropdownMenuItem
						disabled={!canChangeLayout}
						onClick={() => menuDialog.runAfterClose(onLayout)}
					>
						<IconLayoutGrid aria-hidden />
						{copy.workspace.changeLayout}
					</DropdownMenuItem>
				</ControlTooltip>
			</DropdownMenuGroup>

			<DropdownMenuSeparator />
			{/* Settings reaches past the three sections above, so it belongs to
			    none of them and carries no title of its own. */}
			<DropdownMenuGroup>
				<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onSettings)}>
					<IconAdjustmentsHorizontal aria-hidden />
					{copy.settings.title}
				</DropdownMenuItem>
			</DropdownMenuGroup>

			<DropdownMenuSeparator />
			{/* One footer line instead of a source command and a copyright line
			    below it (owner, 2026-09-20): what the product is and who owns it
			    on the left, the way to its source on the right. The link stays a
			    menu item so the keyboard reaches it with the rest. */}
			<DropdownMenuGroup className="flex items-center gap-2 pl-2">
				<p className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
					{copy.menuFooter}
				</p>
				<DropdownMenuItem
					aria-label={copy.actions.github}
					className="px-2"
					render={
						<a href={product.repositoryUrl} target="_blank" rel="noreferrer" />
					}
				>
					<IconBrandGithub aria-hidden className="text-muted-foreground" />
				</DropdownMenuItem>
			</DropdownMenuGroup>
		</DropdownMenuContent>,
	);

	return (
		<>
			<DropdownMenu
				open={menuDialog.open}
				onOpenChange={menuDialog.onOpenChange}
				onOpenChangeComplete={menuDialog.onOpenChangeComplete}
			>
				<ControlTooltip
					name={
						pwaUpdate.ready
							? copy.actions.openAppMenuWithUpdate
							: copy.actions.openAppMenu
					}
				>
					<DropdownMenuTrigger
						render={
							<Button
								ref={triggerRef}
								variant="ghost"
								size="icon-lg"
								// Resting flush with the workspace behind it, so it reads as part
								// of the canvas rather than a panel sitting on top; the surface
								// and shadow that make it read as a floating control only appear
								// once a pointer actually reaches it. Ghost rather than outline
								// because outline carries a resting border and fill of its own in
								// dark mode, which no transparent override on this element can
								// win against.
								className="fixed right-fab-inset bottom-fab-inset z-40 size-fab hover:shadow-(--shadow-floating)"
							/>
						}
					>
						<img
							aria-hidden
							alt=""
							src={`${import.meta.env.BASE_URL}logo.svg`}
							className="size-7"
						/>
						{pwaUpdate.ready ? (
							<span
								aria-hidden
								className="absolute top-1 right-1 size-2 rounded-full border-2 border-surface-app bg-selection-edge"
							/>
						) : null}
					</DropdownMenuTrigger>
				</ControlTooltip>

				{content}
			</DropdownMenu>
			<TransposeTypeChangeDialog
				typedValues={pendingTranspose}
				onCancel={() => setPendingTranspose(null)}
				onConfirm={() => {
					setPendingTranspose(null);
					transposeTable(true);
				}}
				// Back to the menu trigger, where focus lands after a transpose that
				// needed no question, whichever answer closed the dialog.
				finalFocus={() => triggerRef.current}
			/>
		</>
	);
}

// The two commands a table row carries, revealed rather than always drawn: a
// list of tables should read as a list of names, and a pencil and a trash on
// every row turn it into a wall of icons (owner, 2026-09-20). They rest at
// zero opacity instead of being removed, so they keep their place in the row,
// stay focusable, and are revealed by a pointer over the row or by focus
// reaching any item in it. Never `hidden` or `display:none`: that takes them
// out of the tab order, and the keyboard would lose the commands entirely.
const revealedRowActionStyles =
	"px-2 opacity-0 group-hover/table-row:opacity-100 group-focus-within/table-row:opacity-100 focus:opacity-100 focus-visible:opacity-100";

// One row shape for every table, active or not (owner, 2026-09-20): the
// table's colour mark, its name, and the two commands that act on it. Rename
// and delete are menu items in their own right rather than buttons nested in
// one, because a control inside a menu item is neither reachable nor
// announced as its own thing.
function TableRow({
	table,
	position,
	active,
	size,
	deleteRefusal,
	onOpen,
	onRename,
	onDelete,
}: {
	readonly table: TableEntry;
	readonly position: number;
	readonly active: boolean;
	readonly size: string;
	readonly deleteRefusal: string | undefined;
	readonly onOpen: () => void;
	readonly onRename: () => void;
	readonly onDelete: () => void;
}) {
	return (
		<div className="group/table-row flex items-stretch gap-1">
			<DropdownMenuItem
				// The one table the views are projecting, said three ways: the
				// filled row, the check, and the state a screen reader reads.
				aria-current={active ? "true" : undefined}
				className={cn("min-w-0 flex-1", active && "bg-muted")}
				onClick={onOpen}
			>
				{/* The colour is the table's, in every state: a hover or keyboard
				    highlight changes the item's background, never the mark, so the
				    cue does not move as the pointer does. It is never the only
				    cue, since the name is beside it. */}
				<IconFileText aria-hidden className={tableMarkClass(position)} />
				<MenuOption
					truncateLabel
					label={table.name}
					description={active ? size : undefined}
				/>
				{active ? (
					<>
						<IconCheck aria-hidden className="text-muted-foreground" />
						<span className="sr-only">{copy.status.openTable}</span>
					</>
				) : null}
			</DropdownMenuItem>
			{/* One control on the row, holding what can be done to that table
			    (owner, 2026-09-20). Dots only: the chevron would be a second
			    glyph on a control that already reads as "more", and the row has
			    no label for it to follow. It is quiet until the row is hovered
			    or reached from the keyboard. */}
			<DropdownMenuSub>
				<DropdownMenuSubTrigger
					hideIndicator
					aria-label={copy.actions.tableOptionsNamed(table.name)}
					className={cn(
						revealedRowActionStyles,
						"min-h-0 self-center text-muted-foreground",
					)}
				>
					<IconDots aria-hidden />
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent
					aria-label={copy.actions.tableOptionsNamed(table.name)}
				>
					{active ? null : (
						<DropdownMenuItem onClick={onOpen}>
							<IconFileText aria-hidden className={tableMarkClass(position)} />
							{copy.actions.openTable}
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={onRename}>
						<IconPencil aria-hidden />
						{copy.actions.renameTable}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<ControlTooltip reason={deleteRefusal}>
						<DropdownMenuItem
							variant="destructive"
							disabled={deleteRefusal !== undefined}
							onClick={onDelete}
						>
							<IconTrash aria-hidden />
							{copy.actions.deleteTableNamed(table.name)}
						</DropdownMenuItem>
					</ControlTooltip>
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		</div>
	);
}

// Commands that reshape the whole table rather than a row or a column, so they
// sit with the other document commands instead of in an axis menu (#235). Each
// is one step on the document timeline, and each says what it did in a notice
// offering Undo, because the menu that ran it has already closed. The notice is
// the only announcement: its text reaches the polite region once (#235).
//
// Its own component so the work of deciding whether Delete empty rows and
// columns has anything to do runs only while the menu is open.
// Runs Transpose table and reports the result. Without `convertTypedValues`
// it may instead return how many first-column values would become text, for
// the caller to ask about first.
function transposeTable(convertTypedValues = false): number | null {
	const store = useTabeloStore.getState();
	const outcome = store.transposeTable(convertTypedValues);
	if (outcome.status === "confirm") return outcome.typedValues;
	if (outcome.status === "transposed") {
		store.pushNotice({
			severity: "info",
			message: copy.notices.tableTransposed,
			undoFor: useTabeloStore.getState().document,
		});
	}
	return null;
}

function TableStructureCommands({
	onConfirmTranspose,
}: {
	readonly onConfirmTranspose: (typedValues: number) => void;
}) {
	const document = useTabeloStore((state) => state.document);
	const transposeRefusal = useMemo(() => {
		const error = transposeLimitError(document);
		return error ? copy.disabled.transposeLimit(error) : undefined;
	}, [document]);
	const deleteEmptyRefusal = useMemo(() => {
		const result = deleteEmptyRowsAndColumns(document);
		if (result.tableIsEmpty) return copy.disabled.tableHasNoContent;
		return result.document === document
			? copy.disabled.noEmptyRowsOrColumns
			: undefined;
	}, [document]);

	const transpose = () => {
		const typedValues = transposeTable();
		if (typedValues !== null) onConfirmTranspose(typedValues);
	};
	const deleteEmpty = () => {
		const store = useTabeloStore.getState();
		const removed = store.deleteEmptyRowsAndColumns();
		if (removed.rows === 0 && removed.columns === 0) return;
		store.pushNotice({
			severity: "info",
			message: copy.notices.emptyRowsAndColumnsDeleted(
				removed.rows,
				removed.columns,
			),
			undoFor: useTabeloStore.getState().document,
		});
	};

	return (
		<>
			<ControlTooltip reason={transposeRefusal}>
				<DropdownMenuItem
					disabled={transposeRefusal !== undefined}
					onClick={transpose}
				>
					<IconArrowsExchange aria-hidden />
					{copy.actions.transposeTable}
				</DropdownMenuItem>
			</ControlTooltip>
			<ControlTooltip reason={deleteEmptyRefusal}>
				<DropdownMenuItem
					disabled={deleteEmptyRefusal !== undefined}
					onClick={deleteEmpty}
				>
					<IconTableMinus aria-hidden />
					{copy.actions.deleteEmptyRowsAndColumns}
				</DropdownMenuItem>
			</ControlTooltip>
		</>
	);
}
