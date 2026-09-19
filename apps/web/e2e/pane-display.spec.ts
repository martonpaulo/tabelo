import type { Locator } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// A source pane's Display dialog sets the four display settings for that pane
// alone (#276, option C). Each setting's first segment follows the default in
// Settings; any other segment is the pane's own choice, and Use defaults
// returns every setting to following. A pasted table opens in the TSV pane
// beside the grid, so TSV is the pane under test.

const first = samplePerson(0);
const second = samplePerson(1);

async function whiteSpace(pane: Locator): Promise<string | null> {
	return pane.evaluate((element) => {
		const content = element.querySelector<HTMLElement>(".cm-content");
		return content ? getComputedStyle(content).whiteSpace : null;
	});
}

async function openDisplay(tabelo: TabeloPage): Promise<Locator> {
	const menu = await tabelo.openPaneMenu("tsv");
	await menu.getByRole("menuitem", { name: copy.paneDisplay.command }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = tabelo.page.getByRole("dialog", {
		name: copy.paneDisplay.title,
	});
	await dialog.waitFor({ state: "visible" });
	return dialog;
}

function followSegment(group: Locator): Locator {
	return group.getByRole("radio").first();
}

test.beforeEach(async ({ tabelo }) => {
	await tabelo.paste(
		[
			["Name", "City"].join("\t"),
			[first.name, first.city].join("\t"),
			[second.name, second.city].join("\t"),
		].join("\n"),
	);
});

test("a pane's own choice applies at once, and Use defaults follows Settings again", async ({
	tabelo,
}) => {
	const tsv = tabelo.pane("tsv");
	await expect.poll(() => whiteSpace(tsv)).toBe("pre");

	const dialog = await openDisplay(tabelo);
	const wrap = dialog.getByRole("radiogroup", {
		name: copy.settings.wrap.label,
	});
	// A new pane follows every default, so each setting starts on its follow
	// segment and there is nothing yet for Use defaults to clear.
	for (const group of await dialog.getByRole("radiogroup").all()) {
		await expect(followSegment(group)).toBeChecked();
	}
	const useDefaults = dialog.getByRole("button", {
		name: copy.paneDisplay.useDefaults,
	});
	await expect(useDefaults).toBeDisabled();

	await wrap
		.getByRole("radio", { name: copy.paneDisplay.on, exact: true })
		.click();
	await expect(
		wrap.getByRole("radio", { name: copy.paneDisplay.on, exact: true }),
	).toBeChecked();
	await expect.poll(() => whiteSpace(tsv)).toBe("break-spaces");
	await expect(useDefaults).toBeEnabled();

	await useDefaults.click();
	await expect(followSegment(wrap)).toBeChecked();
	await expect.poll(() => whiteSpace(tsv)).toBe("pre");

	await dialog.getByRole("button", { name: copy.paneDisplay.done }).click();
	await expect(dialog).toBeHidden();
	await expect(tabelo.paneMenuTrigger("tsv")).toBeFocused();
});

test("the dialog is operable from the keyboard, and a choice survives a reload", async ({
	tabelo,
	page,
}) => {
	const tsv = tabelo.pane("tsv");
	const trigger = tabelo.paneMenuTrigger("tsv");
	await trigger.focus();
	await page.keyboard.press("Enter");
	const menu = page.getByRole("menu");
	await menu.waitFor({ state: "visible" });
	await menu.getByRole("menuitem", { name: copy.paneDisplay.command }).focus();
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("dialog", { name: copy.paneDisplay.title });
	await dialog.waitFor({ state: "visible" });

	// Arrow keys move within one setting's segments, and choosing is moving:
	// the second segment is this pane's explicit On.
	const wrap = dialog.getByRole("radiogroup", {
		name: copy.settings.wrap.label,
	});
	await followSegment(wrap).focus();
	await page.keyboard.press("ArrowRight");
	await expect(
		wrap.getByRole("radio", { name: copy.paneDisplay.on, exact: true }),
	).toBeChecked();
	await expect.poll(() => whiteSpace(tsv)).toBe("break-spaces");

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();

	await page.reload();
	await expect(tabelo.workspace).toBeVisible();
	await expect.poll(() => whiteSpace(tabelo.pane("tsv"))).toBe("break-spaces");
	const reopened = await openDisplay(tabelo);
	await expect(
		reopened
			.getByRole("radiogroup", { name: copy.settings.wrap.label })
			.getByRole("radio", { name: copy.paneDisplay.on, exact: true }),
	).toBeChecked();
});
