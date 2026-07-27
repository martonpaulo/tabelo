import type { Locator, Page } from "@playwright/test";

function requirePositiveIndex(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer.`);
	}
}

export class TabeloPage {
	readonly workspace: Locator;

	constructor(readonly page: Page) {
		this.workspace = page.getByRole("main", { name: "Workspace" });
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
}
