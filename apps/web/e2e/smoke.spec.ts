import { expect, test } from "./fixtures";

test("opens a clean workspace through accessible product labels", async ({
	tabelo,
}) => {
	await expect(tabelo.pane("Visual table")).toBeVisible();
	await expect(tabelo.pane("Markdown")).toBeVisible();
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "4");
	await expect(tabelo.header(1)).toContainText("Column 1");
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.source("Markdown")).toBeVisible();
});
