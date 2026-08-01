import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { HEADER_ROW } from "@/core/selection";
import type { NoticeSeverity } from "@/state/notice-queue";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import type { LayoutId } from "@/workspace/layout";

type AppCommand = "undo" | "redo" | "newTable" | "downloadTable";
type PaneCommand =
	| "closeView"
	| "zoomOut"
	| "resetZoom"
	| "zoomIn"
	| "copySource"
	| "copyFormattedTable";

const appCommandLabels: Record<AppCommand, string> = {
	undo: copy.actions.undo,
	redo: copy.actions.redo,
	newTable: copy.actions.newTable,
	downloadTable: copy.actions.downloadTable,
};

const paneCommandLabels: Record<PaneCommand, string> = {
	closeView: copy.workspace.closeView,
	zoomOut: copy.workspace.zoomOut,
	resetZoom: copy.workspace.resetZoom,
	zoomIn: copy.workspace.zoomIn,
	copySource: copy.actions.copySource,
	copyFormattedTable: copy.actions.copyFormattedTable,
};

function requirePositiveIndex(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer.`);
	}
}

// Playwright cannot deny the clipboard permission, so the browser boundary
// itself is replaced. This is what the page sees when the user declines, when
// the context is restricted, or when the half of the API being called is
// absent. Serialized into the page, so it closes over nothing.
export type ClipboardFault = "blocked" | "absent" | "empty";

function installClipboard(mode: ClipboardFault | "granted"): void {
	const refuse = () => {
		const error = new Error("denied");
		error.name = "NotAllowedError";
		return Promise.reject(error);
	};
	const silent = {
		read: () => Promise.resolve([]),
		readText: () => Promise.resolve(""),
		write: () => Promise.resolve(),
		writeText: () => Promise.resolve(),
	};
	const value =
		mode === "absent"
			? undefined
			: mode === "blocked"
				? {
						read: refuse,
						readText: refuse,
						write: refuse,
						writeText: refuse,
					}
				: silent;
	Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

// Installed before the next navigation. The app reads navigator.clipboard at
// call time, so the live variant below can also change the answer mid-test.
export async function faultyClipboard(
	page: Page,
	fault: ClipboardFault,
): Promise<void> {
	await page.addInitScript(installClipboard, fault);
}

export async function setClipboard(
	page: Page,
	mode: ClipboardFault | "granted",
): Promise<void> {
	await page.evaluate(installClipboard, mode);
}

export class TabeloPage {
	readonly workspace: Locator;
	readonly notices: Locator;
	// The two permanent announcement regions. They exist whether or not there
	// is anything to say, which is the contract they are here to prove.
	readonly announcements: Locator;
	readonly alerts: Locator;

	constructor(readonly page: Page) {
		this.workspace = page.getByRole("main", { name: copy.a11y.workspace });
		this.notices = page.getByRole("region", { name: copy.a11y.notices });
		this.announcements = page.locator("#global-announcements");
		this.alerts = page.locator("#global-alerts");
	}

	// One notice bar, addressed by what its message means rather than by the
	// colour that meaning is drawn in.
	notice(severity?: NoticeSeverity): Locator {
		return this.notices.locator(
			severity ? `[data-severity="${severity}"]` : "[data-severity]",
		);
	}

	async open(): Promise<void> {
		// Playwright gives every test a fresh BrowserContext, so storage is already
		// isolated. A clear-and-reload cycle duplicated that guarantee and Firefox
		// could abort the second navigation while the PWA finished registering.
		await this.page.goto("/");
		await this.dismissWelcome();
		await this.workspace.waitFor({ state: "visible" });
	}

	async dismissWelcome(): Promise<void> {
		const emptyStart = this.page.getByRole("button", {
			name: copy.empty.emptyAction,
		});
		await emptyStart.click();
	}

	pane(view: ViewId): Locator {
		return this.page.getByRole("region", {
			name: copy.a11y.pane(getView(view).label),
		});
	}

	paneAt(view: ViewId, index: number): Locator {
		return this.pane(view).nth(index);
	}

	grid(): Locator {
		return this.pane("grid").getByRole("grid", {
			name: copy.a11y.grid,
		});
	}

	// Cells and headers are addressed by position rather than by accessible
	// name: their names are now their contents, which is the point: a cell is
	// named after its value, not after its coordinates.
	//
	// The header cell holds editable text only. It is addressed as a cell,
	// because for selection purposes it is one: its row is the header sentinel.
	header(column: number): Locator {
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-cell="${HEADER_ROW}:${column - 1}"]`);
	}

	// One cell of the column index strip, which owns the column's letter, its
	// select handle, and its menu.
	columnIndex(column: number): Locator {
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-column-header="${column - 1}"]`);
	}

	cell(row: number, column: number): Locator {
		requirePositiveIndex(row, "row");
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-cell="${row - 1}:${column - 1}"]`);
	}

	source(view: ViewId): Locator {
		const label = getView(view).label;
		return this.pane(view).getByRole("textbox", {
			name: copy.a11y.sourceEditor(label),
		});
	}

	sourceAt(view: ViewId, index: number): Locator {
		return this.paneAt(view, index).getByRole("textbox");
	}

	// Layout presets, pane views, and column alignments are radio items: they
	// are current states rather than one-off actions.
	async chooseLayout(id: LayoutId): Promise<void> {
		const dialog = await this.openLayoutDialog();
		await dialog.getByRole("radio", { name: copy.layouts[id].label }).click();
		const apply = dialog.getByRole("button", {
			name: copy.workspace.applyLayout,
		});
		if (await apply.isEnabled()) await apply.click();
		else
			await dialog.getByRole("button", { name: copy.actions.cancel }).click();
		await dialog.waitFor({ state: "hidden" });
	}

	async openAppMenu(): Promise<Locator> {
		const menu = this.page.getByRole("menu", {
			name: copy.actions.openAppMenu,
		});
		await menu.waitFor({ state: "hidden" });
		await this.page
			.getByRole("button", { name: copy.actions.openAppMenu })
			.click();
		await menu.waitFor({ state: "visible" });
		return menu;
	}

	async openLayoutDialog(): Promise<Locator> {
		const menu = await this.openAppMenu();
		await this.page
			.getByRole("menuitem", { name: copy.workspace.layout })
			.click();
		await menu.waitFor({ state: "hidden" });
		const dialog = this.page.getByRole("dialog", {
			name: copy.workspace.layout,
		});
		await dialog.waitFor({ state: "visible" });
		return dialog;
	}

	async runAppCommand(command: AppCommand): Promise<void> {
		const menu = await this.openAppMenu();
		await menu
			.getByRole("menuitem", { name: appCommandLabels[command] })
			.click();
	}

	// Every split control currently on screen. The count is the contract at the
	// ends of the range: one pane offers two, since it can be cut either way,
	// and four panes offer none.
	addControls(): Locator {
		return this.workspace.locator("[data-split-control]");
	}

	// Where a pane sits in the 2x2 slot grid, read as grid line numbers rather
	// than pixels: the arrangement is the assertion, not the geometry.
	async paneArea(view: ViewId): Promise<{
		rowStart: number;
		rowEnd: number;
		columnStart: number;
		columnEnd: number;
	}> {
		const area = await this.pane(view).evaluate(
			(node) => window.getComputedStyle(node).gridArea,
		);
		const [rowStart, columnStart, rowEnd, columnEnd] = area
			.split("/")
			.map((part) => Number(part.trim()));
		return { rowStart, rowEnd, columnStart, columnEnd };
	}

	// The control on a pane's splittable edge. Named after the pane and the
	// direction, because that pair is the whole content of the choice.
	splitControl(view: ViewId, edge: "bottom" | "right", index = 0): Locator {
		return this.paneAt(view, index).getByRole("button", {
			name: copy.a11y.addViewAt(edge, copy.a11y.pane(getView(view).label)),
		});
	}

	// Split a pane and choose what the new one shows, which is one flow: the
	// view is picked before anything moves.
	async addViewBySplit(
		view: ViewId,
		edge: "bottom" | "right",
		nextView: ViewId,
	): Promise<void> {
		await this.splitControl(view, edge).click();
		const dialog = this.page.getByRole("dialog");
		await dialog.getByRole("radio", { name: getView(nextView).label }).click();
		await dialog
			.getByRole("button", { name: copy.addView.confirm, exact: true })
			.click();
		await dialog.waitFor({ state: "hidden" });
	}

	async choosePaneView(
		currentView: ViewId,
		nextView: ViewId,
		index = 0,
	): Promise<void> {
		const dialog = await this.openChangeViewDialog(currentView, index);
		await dialog.getByRole("radio", { name: getView(nextView).label }).click();
		await dialog
			.getByRole("button", { name: copy.workspace.changeView })
			.click();
		await dialog.waitFor({ state: "hidden" });
	}

	paneMenuTrigger(view: ViewId, index = 0): Locator {
		const label = getView(view).label;
		return this.paneAt(view, index).getByRole("button", {
			name: `${copy.workspace.paneActions}: ${label}`,
		});
	}

	async openChangeViewDialog(view: ViewId, index = 0): Promise<Locator> {
		const menu = await this.openPaneMenu(view, index);
		await menu
			.getByRole("menuitem", { name: copy.workspace.changeView })
			.click();
		await menu.waitFor({ state: "hidden" });
		const dialog = this.page.getByRole("dialog", {
			name: copy.workspace.changeView,
		});
		await dialog.waitFor({ state: "visible" });
		return dialog;
	}

	async openPaneMenu(view: ViewId, index = 0): Promise<Locator> {
		await this.paneMenuTrigger(view, index).click();
		return this.page.getByRole("menu", {
			name: `${copy.workspace.paneActions}: ${getView(view).label}`,
		});
	}

	// Add view, Close view, and the zoom steps are all plain items in the pane's
	// own menu, so one helper covers every direct pane command.
	async runPaneCommand(
		view: ViewId,
		command: PaneCommand,
		index = 0,
	): Promise<void> {
		const menu = await this.openPaneMenu(view, index);
		await menu
			.getByRole("menuitem", { name: paneCommandLabels[command], exact: true })
			.click();
	}

	async editCell(row: number, column: number, value: string): Promise<void> {
		const cell = this.cell(row, column);
		await cell.dblclick();
		const editor = this.grid().getByRole("textbox", {
			name: copy.a11y.cellEditor(row - 1, column - 1),
		});
		await editor.fill(value);
		await editor.press("Enter");
		await cell.filter({ hasText: value }).waitFor();
	}

	// The header cell edits exactly like a data cell: double click, type, Enter.
	// The editor is named after the header it is renaming, so renaming an
	// already-named column has to say what it is called now.
	async editHeader(column: number, value: string, current = ""): Promise<void> {
		const header = this.header(column);
		await header.dblclick();
		const editor = this.grid().getByRole("textbox", {
			name: copy.a11y.headerEditor(current, column - 1),
		});
		await editor.fill(value);
		await editor.press("Enter");
		await header.filter({ hasText: value }).waitFor();
	}

	async paste(text: string, html?: string): Promise<void> {
		await this.grid().evaluate(
			(grid, payload) => {
				const data = new DataTransfer();
				data.setData("text/plain", payload.text);
				if (payload.html) data.setData("text/html", payload.html);
				const event = new Event("paste", {
					bubbles: true,
					cancelable: true,
				});
				Object.defineProperty(event, "clipboardData", { value: data });
				grid.dispatchEvent(event);
			},
			{ text, html },
		);
	}

	async importFile(
		name: string,
		text: string,
		mimeType = "text/plain",
	): Promise<void> {
		const chooserPromise = this.page.waitForEvent("filechooser");
		await this.openAppMenu();
		await this.page
			.getByRole("menuitem", { name: copy.actions.importFile })
			.click();
		const chooser = await chooserPromise;
		await chooser.setFiles({
			name,
			mimeType,
			buffer: Buffer.from(text),
		});
	}

	async cancelFileImport(): Promise<void> {
		const chooserPromise = this.page.waitForEvent("filechooser");
		await this.openAppMenu();
		await this.page
			.getByRole("menuitem", { name: copy.actions.importFile })
			.click();
		const chooser = await chooserPromise;
		await chooser.setFiles([]);
	}
}
