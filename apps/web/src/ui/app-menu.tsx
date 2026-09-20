import { Button } from "@tabelo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
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
	IconClipboardCopy,
	IconDownload,
	IconExternalLink,
	IconFilePlus,
	IconFileText,
	IconLayoutGrid,
	IconLayoutSidebarRightExpand,
	IconPencil,
	IconRefresh,
	IconTableMinus,
	IconTrash,
	IconUpload,
} from "@tabler/icons-react";
import {
	Fragment,
	type RefObject,
	useId,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { copy } from "@/copy/copy";
import { product } from "@/copy/product";
import { hasInlineContent } from "@/core/document";
import { deleteEmptyRowsAndColumns } from "@/core/operations";
import { isLargeLibrary, tableMarkClass } from "@/core/table-library";
import { canSerialize, listCodecs } from "@/formats";
import {
	canRunHistory,
	getHistoryRevision,
	runHistory,
	subscribeHistory,
} from "@/history/coordinator";
import type { PwaUpdate } from "@/pwa/use-pwa-update";
import { transposeLimitError, useTabeloStore } from "@/state/store";
import { copyCodecToClipboard } from "@/ui/clipboard-actions";
import { TransposeTypeChangeDialog } from "@/ui/grid/cell-type-change-dialog";
import { preconditionRecovery } from "@/ui/precondition-recovery";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { MenuOption } from "@/ui/primitives/menu-option";
import { RecoveryMenuItem } from "@/ui/primitives/recovery-command";
import { useContentWhileOpen } from "@/ui/primitives/use-content-while-open";
import { useMenuDialogCommand } from "@/ui/primitives/use-menu-dialog-command";
import { useStackedWorkspace } from "@/ui/workspace/stacking";
import { flattensInlineContent } from "@/views/projection-loss";
import { getView } from "@/views/registry";
import {
	layoutsForPaneCount,
	paneCapacity,
	splitOptions,
} from "@/workspace/layout";

interface AppMenuProps {
	readonly onImport: () => void;
	readonly onDownload: () => void;
	readonly onLayout: () => void;
	readonly onSettings: () => void;
	readonly onAddView: () => void;
	readonly onNewTable: () => void;
	readonly onDeleteTable: (tableId: string) => void;
	readonly onRename: () => void;
	readonly pwaUpdate: PwaUpdate;
	readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function AppMenu({
	onImport,
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
	const canUndoDocument = useTabeloStore((state) => state.past.length > 0);
	const tableName = useTabeloStore((state) => state.name);
	const library = useTabeloStore((state) => state.library);
	const activeTablePosition = library.tables.findIndex(
		(table) => table.id === library.activeId,
	);
	// The app always shows a table, so the only one left cannot be deleted.
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
			{/* The product mark and name, then the open table as one block that
				    renames it: what the product is sits on the start surface, and
				    this menu starts from the document at hand (owner, 2026-09-19;
				    #358 kept identity and document as separate contexts). */}
			<div
				className={cn(
					"flex items-center gap-2 font-medium text-sm",
					menuItemInsetStyles,
				)}
			>
				<img
					aria-hidden
					alt=""
					src={`${import.meta.env.BASE_URL}logo.svg`}
					className="size-4"
				/>
				{copy.app.name}
			</div>
			{/* The active table, with its two quick controls beside it: rename
			    and delete are one click from the name they act on, rather than
			    commands further down that the reader has to connect to it
			    (owner, 2026-09-20). Two menu items in a row, not a button inside
			    one: a control nested in a menu item is neither reachable nor
			    announced as its own thing. */}
			<DropdownMenuGroup className="mx-1 mb-1 flex items-stretch gap-1">
				<DropdownMenuItem
					aria-label={copy.actions.renameTable}
					aria-description={tableName}
					onClick={() => menuDialog.runAfterClose(onRename)}
					className="min-w-0 flex-1 bg-muted"
				>
					<IconFileText
						aria-hidden
						className={tableMarkClass(activeTablePosition)}
					/>
					<MenuOption
						truncateLabel
						label={tableName}
						description={copy.workspace.tableSize(columnCount, rowCount)}
					/>
					<IconPencil aria-hidden className="text-muted-foreground" />
				</DropdownMenuItem>
				<ControlTooltip reason={deleteRefusal}>
					<DropdownMenuItem
						variant="destructive"
						disabled={deleteRefusal !== undefined}
						aria-label={copy.actions.deleteTableNamed(tableName)}
						onClick={() =>
							menuDialog.runAfterClose(() => onDeleteTable(library.activeId))
						}
						className="bg-muted px-2"
					>
						<IconTrash aria-hidden />
					</DropdownMenuItem>
				</ControlTooltip>
			</DropdownMenuGroup>
			<DropdownMenuGroup
				aria-label={copy.actions.switchTable}
				// Past the size where one list reads comfortably it scrolls
				// rather than pushing the rest of the menu off screen (#403).
				className="max-h-56 overflow-y-auto"
			>
				{/* The active table is the item above, with its size and its
					    rename control, so the list holds the others (owner,
					    2026-09-20). */}
				{library.tables
					.filter((table) => table.id !== library.activeId)
					.map((table) => (
						<div key={table.id} className="flex items-stretch gap-1">
							<DropdownMenuItem
								className="min-w-0 flex-1"
								onClick={() =>
									menuDialog.runAfterClose(() =>
										useTabeloStore.getState().switchTable(table.id),
									)
								}
							>
								{/* The colour is the table's, in every state: a hover or
									    keyboard highlight changes the item's background, never
									    the mark, so the cue does not move as the pointer
									    does. It is never the only cue, since the name is
									    beside it. */}
								<IconFileText
									aria-hidden
									className={tableMarkClass(
										library.tables.findIndex(
											(candidate) => candidate.id === table.id,
										),
									)}
								/>
								<span className="truncate">{table.name}</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								aria-label={copy.actions.deleteTableNamed(table.name)}
								onClick={() =>
									menuDialog.runAfterClose(() => onDeleteTable(table.id))
								}
								className="px-2"
							>
								<IconTrash aria-hidden />
							</DropdownMenuItem>
						</div>
					))}
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
			{/* Undo and redo side by side: two halves of one control. */}
			<DropdownMenuGroup className="mx-1 grid grid-cols-2 gap-1">
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
			</DropdownMenuGroup>

			<DropdownMenuSeparator />
			<TableStructureGroup
				onConfirmTranspose={(typedValues) =>
					menuDialog.runAfterClose(() => setPendingTranspose(typedValues))
				}
			/>

			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				{/* Import runs on the click itself, not after the menu's close
					    animation. The file picker is the browser's own layer, so it
					    never stacks over the menu, and asking for it needs the user
					    activation that this click carries: deferred behind a
					    transition, a slow frame can let that activation lapse and the
					    browser then drops the request without a word. Every other
					    command here opens an in-app dialog and still waits. */}
				<DropdownMenuItem onClick={onImport}>
					<IconUpload aria-hidden />
					{copy.actions.importFile}
				</DropdownMenuItem>
				<CopyAsSubmenu runAfterClose={menuDialog.runAfterClose} />
				<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onDownload)}>
					<IconDownload aria-hidden />
					{copy.actions.downloadTable}
				</DropdownMenuItem>
			</DropdownMenuGroup>

			<DropdownMenuSeparator />
			<DropdownMenuGroup>
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
				<DropdownMenuItem onClick={() => menuDialog.runAfterClose(onSettings)}>
					<IconAdjustmentsHorizontal aria-hidden />
					{copy.settings.title}
				</DropdownMenuItem>
			</DropdownMenuGroup>

			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuItem
					render={
						<a href={product.repositoryUrl} target="_blank" rel="noreferrer" />
					}
				>
					<IconBrandGithub aria-hidden />
					{copy.actions.github}
					<IconExternalLink
						aria-hidden
						className="ml-auto text-muted-foreground"
					/>
				</DropdownMenuItem>
			</DropdownMenuGroup>
			<p
				className={cn(
					"text-muted-foreground text-xs",
					menuItemInsetStyles,
					"pt-0",
				)}
			>
				{copy.app.copyright}
			</p>
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

// Copying the document as a format needs no pane showing that format, so this
// is a document-level command over codecs rather than over views. The list is
// the codec registry in its own order; nothing here names a format, so a codec
// added later gains a row without an edit. See docs/adr/0005.
//
// A submenu rather than a dialog because every row performs its command the
// moment it is chosen and needs nothing stated beforehand, which is the whole
// of the class docs/design-system/3-components.md allows one for.
function CopyAsSubmenu({
	runAfterClose,
}: {
	readonly runAfterClose: (command: () => void) => void;
}) {
	const document = useTabeloStore((state) => state.document);
	const noteId = useId();

	// While the table holds formatting, the formats that cannot spell it are
	// named before any is chosen (#306). Which formats those are is codec
	// data, read from the registry, never a list of ids kept here.
	const textOnly = useMemo(
		() =>
			hasInlineContent(document)
				? listCodecs()
						.filter(flattensInlineContent)
						.map((codec) => getView(codec.id).label)
				: [],
		[document],
	);

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<IconClipboardCopy aria-hidden />
				{copy.actions.copyAs}
			</DropdownMenuSubTrigger>
			{/* No width of its own: the primitive already sizes a submenu to its
			    content above a shared floor, and the shared spacing rhythm comes
			    with it. */}
			<DropdownMenuSubContent
				aria-label={copy.actions.copyAs}
				aria-describedby={textOnly.length > 0 ? noteId : undefined}
			>
				{/* Static text, not a menu item, so it describes the submenu
				    rather than joining its items. `w-0 min-w-full` lets the rows
				    set the width and the note wrap inside it. */}
				{textOnly.length > 0 ? (
					<p
						id={noteId}
						className={cn(
							"w-0 min-w-full text-muted-foreground text-xs",
							menuItemInsetStyles,
						)}
					>
						{copy.actions.copyAsTextOnly(textOnly)}
					</p>
				) : null}
				{listCodecs().map((codec) => {
					const view = getView(codec.id);
					const failure = canSerialize(codec, document);
					const recovery = preconditionRecovery(failure);
					const Icon = view.icon;

					return (
						// The refusal and its correction are the same pair the download
						// chooser and the pane menu already show, in the same words: the
						// row stays disabled and the correction stands beside it.
						<Fragment key={codec.id}>
							<ControlTooltip
								reason={
									failure ? copy.disabled.codecPrecondition(failure) : undefined
								}
							>
								<DropdownMenuItem
									disabled={failure !== null}
									onClick={() => void copyCodecToClipboard(codec, document)}
								>
									<Icon aria-hidden />
									{view.label}
								</DropdownMenuItem>
							</ControlTooltip>
							{recovery ? (
								<RecoveryMenuItem
									recovery={recovery}
									target={view.label}
									onRun={runAfterClose}
								/>
							) : null}
						</Fragment>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
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

function TableStructureGroup({
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
		<DropdownMenuGroup>
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
		</DropdownMenuGroup>
	);
}
