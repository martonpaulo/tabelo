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
		await this.page.goto("/");
		await this.page.evaluate(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});
		await this.page.reload();
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

	header(column: number): Locator {
		requirePositiveIndex(column, "column");
		return this.grid().getByRole("columnheader", {
			name: `Header for column ${column}`,
		});
	}

	cell(row: number, column: number): Locator {
		requirePositiveIndex(row, "row");
		requirePositiveIndex(column, "column");
		return this.grid().getByRole("gridcell", {
			name: `Row ${row}, column ${column}`,
		});
	}

	source(view: string): Locator {
		return this.pane(view).getByRole("textbox", {
			name: `${view} source`,
		});
	}

	sourceAt(view: string, index: number): Locator {
		return this.paneAt(view, index).getByRole("textbox");
	}

	async chooseLayout(label: string): Promise<void> {
		await this.page.getByRole("button", { name: /^Layout:/ }).click();
		await this.page.getByRole("menuitem").filter({ hasText: label }).click();
	}

	async choosePaneView(
		currentView: string,
		nextView: string,
		index = 0,
	): Promise<void> {
		const pane = this.paneAt(currentView, index);
		await pane
			.getByRole("button", { name: `Pane actions: ${currentView}` })
			.click();
		await this.page.getByRole("menuitem").filter({ hasText: nextView }).click();
	}

	async editCell(row: number, column: number, value: string): Promise<void> {
		const cell = this.cell(row, column);
		await cell.dblclick();
		const editor = this.grid().getByRole("textbox", {
			name: `Row ${row}, column ${column}`,
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
		await this.page.getByRole("button", { name: "File", exact: true }).click();
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
		await this.page.getByRole("button", { name: "File", exact: true }).click();
		await this.page.getByRole("menuitem", { name: "Import file" }).click();
		const chooser = await chooserPromise;
		await chooser.setFiles([]);
	}
}
