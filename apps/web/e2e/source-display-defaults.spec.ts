import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// A source pane's display follows the global default in Settings until the
// pane makes its own choice, and that choice is kept as a choice: a pane told
// to stay unwrapped does not start wrapping because the default did (#276).

const first = samplePerson(0);
const second = samplePerson(1);

async function whiteSpace(pane: Locator): Promise<string | null> {
	return pane.evaluate((element) => {
		const content = element.querySelector<HTMLElement>(".cm-content");
		return content ? getComputedStyle(content).whiteSpace : null;
	});
}

async function setWrapDefault(page: Page, wrap: boolean): Promise<void> {
	const trigger = page.getByRole("button", { name: copy.actions.openAppMenu });
	await trigger.click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	await dialog.waitFor({ state: "visible" });
	const toggle = dialog.getByRole("switch", { name: copy.settings.wrap.label });
	if (wrap) await toggle.check();
	else await toggle.uncheck();
	await dialog.getByRole("button", { name: copy.settings.done }).click();
	await expect(dialog).toBeHidden();
}

async function wrapItem(tabelo: TabeloPage, view: "markdown" | "csv") {
	const menu = await tabelo.openPaneMenu(view);
	return menu.getByRole("menuitemcheckbox", {
		name: copy.workspace.wrapSource,
	});
}

async function closePaneMenu(tabelo: TabeloPage, view: "markdown" | "csv") {
	await tabelo.paneMenuTrigger(view).click();
	await expect(tabelo.page.getByRole("menu")).toHaveCount(0);
}

test("a changed default moves only the panes that follow it, across a reload", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(
		[
			["Name", "City"].join("\t"),
			[first.name, first.city].join("\t"),
			[second.name, second.city].join("\t"),
		].join("\n"),
	);
	await tabelo.addViewBySplit("markdown", "bottom", "csv");
	const markdown = tabelo.pane("markdown");
	const csv = tabelo.pane("csv");
	await expect.poll(() => whiteSpace(markdown)).toBe("pre");
	await expect.poll(() => whiteSpace(csv)).toBe("pre");

	// The CSV pane says "off" for itself: on, then off again. It shows what it
	// showed before, but now as its own choice rather than the default's.
	let item = await wrapItem(tabelo, "csv");
	await item.click();
	await expect(item).toBeChecked();
	await item.click();
	await expect(item).not.toBeChecked();
	await closePaneMenu(tabelo, "csv");

	await setWrapDefault(page, true);
	await expect.poll(() => whiteSpace(markdown)).toBe("break-spaces");
	await expect.poll(() => whiteSpace(csv)).toBe("pre");

	await page.reload();
	await expect(tabelo.workspace).toBeVisible();
	await expect.poll(() => whiteSpace(markdown)).toBe("break-spaces");
	await expect.poll(() => whiteSpace(csv)).toBe("pre");
	item = await wrapItem(tabelo, "markdown");
	await expect(item).toBeChecked();
	await closePaneMenu(tabelo, "markdown");
	item = await wrapItem(tabelo, "csv");
	await expect(item).not.toBeChecked();
	await closePaneMenu(tabelo, "csv");

	// And back: the following pane moves again, the choosing one stays put.
	await setWrapDefault(page, false);
	await expect.poll(() => whiteSpace(markdown)).toBe("pre");
	await expect.poll(() => whiteSpace(csv)).toBe("pre");
});

test("a pane's own choice survives a default that agrees and then disagrees", async ({
	tabelo,
	page,
}) => {
	await tabelo.paste(
		[["Name", "City"].join("\t"), [first.name, first.city].join("\t")].join(
			"\n",
		),
	);
	const markdown = tabelo.pane("markdown");

	const item = await wrapItem(tabelo, "markdown");
	await item.click();
	await expect(item).toBeChecked();
	await closePaneMenu(tabelo, "markdown");
	await expect.poll(() => whiteSpace(markdown)).toBe("break-spaces");

	// The default comes round to the pane's value and goes away again; the
	// pane chose, so it keeps wrapping throughout.
	await setWrapDefault(page, true);
	await setWrapDefault(page, false);
	await expect.poll(() => whiteSpace(markdown)).toBe("break-spaces");
});
