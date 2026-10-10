import type { Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import { renderedSource, type TabeloPage } from "./helpers";

// Markdown's opt-in boolean spelling (#484): `[x]` and `[ ]` instead of
// `true` and `false`. The cell stays the same boolean, and a token is read
// back as one only where the text did not change; new or edited text stays
// the text the user typed. Jira's status icons, HTML's checkbox, and the
// rendered preview that follows HTML share the one setting (#485).

const first = samplePerson(0);
const second = samplePerson(1);
const HEADER = "active";

async function importBooleans(
	tabelo: TabeloPage,
	view: ViewId = "markdown",
): Promise<void> {
	await tabelo.importFile(
		"people.json",
		JSON.stringify([
			{ name: first.name, [HEADER]: true },
			{ name: second.name, [HEADER]: false },
		]),
		"application/json",
	);
	await expect(tabelo.cell(1, 1)).toHaveText(first.name);
	// The import shows its own format; the pane it switches to is what is
	// tested.
	await tabelo.choosePaneView("json", view);
}

async function setMarks(page: Page, on: boolean): Promise<void> {
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	const menu = page.getByRole("menu", { name: copy.actions.openAppMenu });
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	const toggle = dialog.getByRole("switch", {
		name: copy.settings.booleanMarks.label,
	});
	if (on) await toggle.check();
	else await toggle.uncheck();
	await dialog.getByRole("button", { name: copy.settings.done }).click();
	await expect(dialog).toBeHidden();
}

function bodyLines(text: string): string[] {
	return text
		.split("\n")
		.slice(2)
		.map((line) => line.replace(/\s+/g, " "));
}

test("switching the spelling rewrites the pane and keeps the booleans", async ({
	tabelo,
	page,
}) => {
	await importBooleans(tabelo);
	const markdown = tabelo.pane("markdown");
	await expect
		.poll(async () => bodyLines(await renderedSource(markdown)))
		.toEqual([`| ${first.name} | true |`, `| ${second.name} | false |`]);

	await setMarks(page, true);
	await expect
		.poll(async () => bodyLines(await renderedSource(markdown)))
		.toEqual([`| ${first.name} | [x] |`, `| ${second.name} | [ ] |`]);
	await expect(tabelo.cell(1, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(tabelo.cell(2, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"false",
	);

	await setMarks(page, false);
	await expect
		.poll(async () => bodyLines(await renderedSource(markdown)))
		.toEqual([`| ${first.name} | true |`, `| ${second.name} | false |`]);
});

test("an unchanged token stays a boolean and an edited one stays text", async ({
	tabelo,
	page,
}) => {
	await importBooleans(tabelo);
	await setMarks(page, true);
	await expect
		.poll(async () => bodyLines(await renderedSource(tabelo.pane("markdown"))))
		.toEqual([`| ${first.name} | [x] |`, `| ${second.name} | [ ] |`]);

	// The first row's name changes and its token does not; the second row's
	// token is edited from `[ ]` to `[x]`.
	await tabelo
		.source("markdown")
		.fill(
			`| name | ${HEADER} |\n| --- | --- |\n| ${first.name}a | [x] |\n| ${second.name} | [x] |`,
		);
	await expect(tabelo.cell(1, 1)).toHaveText(`${first.name}a`);
	await expect(tabelo.cell(1, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(tabelo.cell(2, 2)).toHaveText("[x]");
	await expect(tabelo.cell(2, 2).getByRole("checkbox")).toHaveCount(0);
});

test("without the spelling a typed token is text", async ({ tabelo }) => {
	await importBooleans(tabelo);
	await tabelo
		.source("markdown")
		.fill(
			`| name | ${HEADER} |\n| --- | --- |\n| ${first.name} | [x] |\n| ${second.name} | false |`,
		);
	await expect(tabelo.cell(1, 2)).toHaveText("[x]");
	await expect(tabelo.cell(1, 2).getByRole("checkbox")).toHaveCount(0);
	// Projection text still keeps the boolean it projects while the spelling
	// is off.
	await expect(tabelo.cell(2, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"false",
	);
});

test("switching the spelling after an edit shows the new spelling", async ({
	tabelo,
	page,
}) => {
	await importBooleans(tabelo);
	// A committed edit leaves the pane holding the text as typed.
	await tabelo
		.source("markdown")
		.fill(
			`| name | ${HEADER} |\n| --- | --- |\n| ${first.name}a | true |\n| ${second.name} | false |`,
		);
	await expect(tabelo.cell(1, 1)).toHaveText(`${first.name}a`);

	await setMarks(page, true);
	await expect
		.poll(async () => bodyLines(await renderedSource(tabelo.pane("markdown"))))
		.toEqual([`| ${first.name}a | [x] |`, `| ${second.name} | [ ] |`]);
	await expect(tabelo.cell(1, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"true",
	);
});

// Jira has no padding, so its lines are compared as written.
function jiraBodyLines(text: string): string[] {
	return text.split("\n").slice(1);
}

test("Jira writes status icons and keeps only an unchanged one as a boolean", async ({
	tabelo,
	page,
}) => {
	await importBooleans(tabelo, "jira");
	const jira = tabelo.pane("jira");
	await expect
		.poll(async () => jiraBodyLines(await renderedSource(jira)))
		.toEqual([`|${first.name}|true|`, `|${second.name}|false|`]);

	await setMarks(page, true);
	await expect
		.poll(async () => jiraBodyLines(await renderedSource(jira)))
		.toEqual([`|${first.name}|(/)|`, `|${second.name}|(x)|`]);

	// The first row's name changes and its icon does not; the second row's
	// icon is edited from `(x)` to `(/)`.
	await tabelo
		.source("jira")
		.fill(`||name||${HEADER}||\n|${first.name}a|(/)|\n|${second.name}|(/)|`);
	await expect(tabelo.cell(1, 1)).toHaveText(`${first.name}a`);
	await expect(tabelo.cell(1, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(tabelo.cell(2, 2)).toHaveText("(/)");
	await expect(tabelo.cell(2, 2).getByRole("checkbox")).toHaveCount(0);
});

test("the preview follows the HTML spelling with read-only checkboxes", async ({
	tabelo,
	page,
}) => {
	await importBooleans(tabelo, "html-preview");
	const table = tabelo
		.pane("html-preview")
		.getByRole("table", { name: copy.a11y.preview });
	await expect(table.getByRole("cell").nth(1)).toHaveText("true");
	await expect(table.getByRole("checkbox")).toHaveCount(0);

	await setMarks(page, true);
	const boxes = table.getByRole("checkbox");
	await expect(boxes).toHaveCount(2);
	await expect(boxes.nth(0)).toHaveAttribute("aria-checked", "true");
	await expect(boxes.nth(1)).toHaveAttribute("aria-checked", "false");
	await expect(boxes.nth(0)).toHaveAttribute("aria-readonly", "true");
	// Clicking a read-only checkbox changes nothing, and it is no tab stop.
	await boxes.nth(1).click();
	await expect(boxes.nth(1)).toHaveAttribute("aria-checked", "false");
	await expect(boxes.nth(1)).toHaveAttribute("tabindex", "-1");
	await expect(tabelo.cell(2, 2).getByRole("checkbox")).toHaveAttribute(
		"aria-checked",
		"false",
	);

	await setMarks(page, false);
	await expect(table.getByRole("checkbox")).toHaveCount(0);
});
