import type { Locator, Page } from "@playwright/test";

function requirePositiveIndex(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer.`);
	}
}

export class TabeloPage {
	readonly workspace: Locator;
	readonly status: Locator;

	constructor(readonly page: Page) {
		this.workspace = page.getByRole("main", { name: "Workspace" });
		this.status = page.getByRole("status");
	}

	async open(): Promise<void> {
		// Playwright gives every test a fresh BrowserContext, so storage is already
		// isolated. A clear-and-reload cycle duplicated that guarantee and Firefox
		// could abort the second navigation while the PWA finished registering.
		await this.page.goto("/");
		await this.workspace.waitFor({ state: "visible" });
	}

	pane(view: string): Locator {
		return this.page.getByRole("region", { name: `${view} pane` });
	}

	paneAt(view: string, index: number): Locator {
		return this.pane(view).nth(index);
	}

	grid(): Locator {
		return this.pane("Visual table").getByRole("grid", {
			name: "Table editor",
		});
	}

	// Cells and headers are addressed by position rather than by accessible
	// name: their names are now their contents, which is the point — a cell is
	// named after its value, not after its coordinates.
	header(column: number): Locator {
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-column-header="${column - 1}"]`);
	}

	cell(row: number, column: number): Locator {
		requirePositiveIndex(row, "row");
		requirePositiveIndex(column, "column");
		return this.grid().locator(`[data-cell="${row - 1}:${column - 1}"]`);
	}

	source(view: string): Locator {
		return this.pane(view).getByRole("textbox", {
			name: `${view} source`,
		});
	}

	sourceAt(view: string, index: number): Locator {
		return this.paneAt(view, index).getByRole("textbox");
	}

	// Layout presets, pane views, and column alignments are radio items: they
	// are current states rather than one-off actions.
	async chooseLayout(label: string): Promise<void> {
		const menu = await this.openLayoutMenu();
		await menu.getByRole("menuitemradio").filter({ hasText: label }).click();
	}

	async openAppMenu(): Promise<Locator> {
		await this.page.getByRole("button", { name: "Open Tabelo menu" }).click();
		return this.page.getByRole("menu", { name: "Open Tabelo menu" });
	}

	async openLayoutMenu(): Promise<Locator> {
		await this.openAppMenu();
		await this.page.getByRole("menuitem", { name: "Layout" }).click();
		const menu = this.page.getByRole("menu", { name: "Layout" });
		await menu.waitFor({ state: "visible" });
		return menu;
	}

	async runAppCommand(command: string): Promise<void> {
		const menu = await this.openAppMenu();
		await menu.getByRole("menuitem", { name: command }).click();
	}

	async choosePaneView(
		currentView: string,
		nextView: string,
		index = 0,
	): Promise<void> {
		const menu = await this.openPaneMenu(currentView, index);
		await menu.getByRole("menuitemradio").filter({ hasText: nextView }).click();
		// Selecting a view closes this menu as a side effect. A caller that
		// immediately reopens the same pane's menu needs that close to be
		// finished first, not merely under way.
		await menu.waitFor({ state: "hidden" });
	}

	paneMenuTrigger(view: string, index = 0): Locator {
		return this.paneAt(view, index).getByRole("button", {
			name: `Pane actions: ${view}`,
		});
	}

	async openPaneMenu(view: string, index = 0): Promise<Locator> {
		await this.paneMenuTrigger(view, index).click();
		return this.page.getByRole("menu", { name: `Pane actions: ${view}` });
	}

	// Add view, Close view, and the zoom steps are all plain items in the pane's
	// own menu, so one helper covers every direct pane command.
	async runPaneCommand(
		view: string,
		command: string,
		index = 0,
	): Promise<void> {
		const menu = await this.openPaneMenu(view, index);
		await menu.getByRole("menuitem", { name: command, exact: true }).click();
	}

	async editCell(row: number, column: number, value: string): Promise<void> {
		const cell = this.cell(row, column);
		await cell.dblclick();
		const editor = this.grid().getByRole("textbox", {
			name: `Row ${row + 1}, column ${column}`,
		});
		await editor.fill(value);
		await editor.press("Enter");
		await cell.filter({ hasText: value }).waitFor();
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
		await this.page.getByRole("menuitem", { name: "Import file" }).click();
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
		await this.page.getByRole("menuitem", { name: "Import file" }).click();
		const chooser = await chooserPromise;
		await chooser.setFiles([]);
	}
}
