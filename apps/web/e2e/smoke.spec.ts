import { defaultHeader } from "@/core/document";
import { product } from "@/product";
import { expect, test } from "./fixtures";

test("opens a clean workspace through accessible product labels", async ({
	page,
	tabelo,
}) => {
	await expect(page).toHaveTitle(product.documentTitle);
	await expect(tabelo.pane("grid")).toBeVisible();
	await expect(tabelo.pane("markdown")).toBeVisible();
	await expect(tabelo.grid()).toHaveAttribute("aria-rowcount", "4");
	await expect(tabelo.header(1)).toContainText(defaultHeader(0));
	await expect(tabelo.cell(1, 1)).toHaveText("");
	await expect(tabelo.source("markdown")).toBeVisible();
});
