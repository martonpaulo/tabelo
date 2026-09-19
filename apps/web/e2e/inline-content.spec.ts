import type { Locator, Page } from "@playwright/test";
import { copy } from "@/copy/copy";
import { conditionNoticeIds } from "@/state/notice-queue";
import { expect, test } from "./fixtures";
import { renderedSource, type TabeloPage } from "./helpers";

// #306, delivery slice 2: the codecs that spell inline structure carry it
// between views, the rendered preview shows it as semantic elements under the
// link and image safety rules, and a view that shows it only as text keeps
// untouched cells formatted and says what it cannot spell.

// A secure image and an insecure one, so the preview has one of each state.
// The secure one is answered locally: the contract is what the page asks for
// and how it asks, not whether a remote host is up.
const SECURE_IMAGE = "https://example.com/rio.png";
const INSECURE_IMAGE = "http://example.com/madrid.png";
const PIXEL = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
	"base64",
);

const fixture = [
	"| **Name** | City | Photo |",
	"| --- | --- | --- |",
	`| **Ingrid** | [Rio](https://example.com/rio) | ![Sugarloaf](${SECURE_IMAGE}) |`,
	`| _Paulo_ | [Madrid](javascript:alert(1)) | ![Retiro](${INSECURE_IMAGE}) |`,
].join("\n");

async function loadFixture(tabelo: TabeloPage): Promise<void> {
	await tabelo.page.route(SECURE_IMAGE, (route) =>
		route.fulfill({ contentType: "image/png", body: PIXEL }),
	);
	await tabelo.importFile("roster.md", fixture, "text/markdown");
	await expect(tabelo.cell(1, 1)).toHaveText("Ingrid");
}

function previewTable(pane: Locator): Locator {
	return pane.getByRole("table", { name: copy.a11y.preview });
}

function disclosure(page: Page): Locator {
	return page.locator(
		`[data-notice-id="${conditionNoticeIds.projectionLoss}"]`,
	);
}

test("formatted Markdown carries its structure into HTML and Jira", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);

	await tabelo.showInSourcePane("html");
	const html = await renderedSource(tabelo.pane("html"));
	expect(html).toContain("<th><strong>Name</strong></th>");
	expect(html).toContain("<td><strong>Ingrid</strong></td>");
	expect(html).toContain('<a href="https://example.com/rio">Rio</a>');
	expect(html).toContain(`<img src="${SECURE_IMAGE}" alt="Sugarloaf">`);

	await tabelo.showInSourcePane("jira");
	const jira = await renderedSource(tabelo.pane("jira"));
	expect(jira).toContain("*Ingrid*");
	expect(jira).toContain("_Paulo_");
	expect(jira).toContain("[Rio|https://example.com/rio]");
	expect(jira).toContain(`!${SECURE_IMAGE}|alt=Sugarloaf!`);

	// Back to Markdown: nothing accumulated on the way through.
	await tabelo.showInSourcePane("markdown");
	const markdown = await renderedSource(tabelo.pane("markdown"));
	expect(markdown).toContain("**Ingrid**");
	expect(markdown).toContain("[Rio](https://example.com/rio)");
});

test("the preview renders structure as semantic elements, safely", async ({
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.showInSourcePane("html-preview");
	const table = previewTable(tabelo.pane("html-preview"));

	await expect(table.locator("th strong")).toHaveText("Name");
	await expect(table.locator("td strong")).toHaveText("Ingrid");
	await expect(table.locator("td em")).toHaveText("Paulo");

	// A web link opens in its own browsing context and tells it nothing.
	const link = table.getByRole("link", { name: "Rio" });
	await expect(link).toHaveAttribute("href", "https://example.com/rio");
	await expect(link).toHaveAttribute("target", "_blank");
	await expect(link).toHaveAttribute("rel", "noopener noreferrer");

	// An address Tabelo will not open stays readable and is not a link.
	await expect(table.getByRole("link", { name: "Madrid" })).toHaveCount(0);
	await expect(table.locator("[data-inert-link]")).toHaveText("Madrid");

	// A secure image loads lazily and sends no referrer.
	const image = table.getByRole("img", { name: "Sugarloaf" });
	await expect(image).toHaveAttribute("loading", "lazy");
	await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");

	// An insecure one never loads and shows its alternative text instead.
	const unavailable = table.getByRole("img", { name: "Retiro" });
	await expect(unavailable).toHaveAttribute("data-image-state", "unavailable");
	await expect(unavailable).toContainText("Retiro");
	await expect(table.locator(`img[src="${INSECURE_IMAGE}"]`)).toHaveCount(0);
});

test("editing one cell in CSV keeps every other cell's formatting", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.showInSourcePane("csv");

	// A formatted table in a view that shows it only as text says so.
	await expect(disclosure(page)).toBeVisible();

	const editor = tabelo.source("csv");
	await editor.click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type(" park");
	await expect(tabelo.cell(2, 3)).toHaveText("Retiro park");

	await tabelo.showInSourcePane("markdown");
	await expect
		.poll(() => renderedSource(tabelo.pane("markdown")))
		.toContain("Retiro park");
	const markdown = await renderedSource(tabelo.pane("markdown"));
	// The edited cell became the text it was given.
	expect(markdown).not.toContain(`](${INSECURE_IMAGE})`);
	// Every cell the edit did not touch kept its structure.
	expect(markdown).toContain("**Name**");
	expect(markdown).toContain("**Ingrid**");
	expect(markdown).toContain("_Paulo_");
	expect(markdown).toContain("[Rio](https://example.com/rio)");
	expect(markdown).toContain(`![Sugarloaf](${SECURE_IMAGE})`);

	// Only a plain view discloses anything.
	await expect(disclosure(page)).toHaveCount(0);
});

test("the plain projection disclosure can be dismissed", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	await tabelo.showInSourcePane("csv");
	await expect(disclosure(page)).toBeVisible();

	await disclosure(page)
		.getByRole("button", { name: copy.actions.dismiss })
		.click();
	await expect(disclosure(page)).toHaveCount(0);
});

test("downloading a plain format discloses the projection first", async ({
	page,
	tabelo,
}) => {
	await loadFixture(tabelo);
	await page.getByRole("button", { name: copy.actions.openAppMenu }).click();
	await page
		.getByRole("menuitem", { name: copy.actions.downloadTable })
		.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	const note = dialog.locator("[data-projection-disclosure]");

	await dialog.getByRole("radio", { name: /CSV/ }).click();
	await expect(note).toBeVisible();

	await dialog.getByRole("radio", { name: /Markdown/ }).click();
	await expect(note).toHaveCount(0);
});
