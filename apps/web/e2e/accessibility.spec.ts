import { copy } from "@/copy/copy";
import { expectNoAxeViolations } from "./axe";
import { expect, test } from "./fixtures";

// Seven representative states, not a scan after every action: the suite stays
// fast and each failure names one surface. This is a sample, so a state absent
// here is unscanned rather than proven clean. The source views other than
// Markdown share one editor owner and one set of capabilities, and the rendered
// preview has no editable or error state, so neither gets its own scan; their
// behavioural tests continue to cover them.
//
// A violation found here is fixed, or tracked as its own issue and left red.
// No blanket rule exclusion, subtree exclusion, or accepted-violation snapshot
// may be added to turn this green. #327 is the one open finding: the column
// index strip's presentational row re-parents its buttons into the grid, so
// every state that exposes the grid fails aria-required-children until the
// design contract that produced it is settled.

const invalidMarkdown =
	"| Name | Role |\n| not a divider |\n| Ingrid | Designer |";

test("the first-visit surface has no WCAG violations", async ({
	page,
}, testInfo) => {
	// The tabelo fixture dismisses welcome on open, so this state is reached
	// through the raw page.
	await page.goto("/");
	const welcome = page.getByRole("region", { name: copy.empty.title });
	await expect(welcome).toBeVisible();
	await expect(
		welcome.getByRole("button", { name: copy.empty.emptyAction }),
	).toBeVisible();

	await expectNoAxeViolations(page, testInfo, "first visit");
});

test("a workspace with the grid focused has no WCAG violations", async ({
	page,
	tabelo,
}, testInfo) => {
	const cell = tabelo.cell(1, 1);
	await cell.click();
	await expect(cell).toBeFocused();

	await expectNoAxeViolations(page, testInfo, "grid focused");
});

test("a workspace with a source editor focused has no WCAG violations", async ({
	page,
	tabelo,
}, testInfo) => {
	const editor = tabelo.source("markdown");
	await editor.waitFor({ state: "visible" });
	await editor.focus();
	await expect(editor).toBeFocused();

	await expectNoAxeViolations(page, testInfo, "source focused");
});

test("an open menu has no WCAG violations", async ({
	page,
	tabelo,
}, testInfo) => {
	const menu = await tabelo.openPaneMenu("grid");
	await expect(menu.getByRole("menuitem").first()).toBeVisible();

	await expectNoAxeViolations(page, testInfo, "open menu");
});

test("an open dialog has no WCAG violations", async ({
	page,
	tabelo,
}, testInfo) => {
	// Change view carries disabled choices and their persistent descriptions,
	// which is the dialog content most likely to break an ARIA relationship.
	const dialog = await tabelo.openChangeViewDialog("markdown");
	await expect(dialog.getByRole("radio").first()).toBeVisible();

	await expectNoAxeViolations(page, testInfo, "open dialog");
});

test("a parse-error state has no WCAG violations", async ({
	page,
	tabelo,
}, testInfo) => {
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	await editor.fill(invalidMarkdown);

	await expect(editor).toHaveAttribute("aria-invalid", "true");
	const descriptionId = await editor.getAttribute("aria-describedby");
	expect(descriptionId).toBeTruthy();
	await expect(pane.locator(`#${descriptionId}`)).not.toBeEmpty();

	await expectNoAxeViolations(page, testInfo, "parse error");
});

test("the settings dialog has no WCAG violations", async ({
	page,
	tabelo,
}, testInfo) => {
	const menu = await tabelo.openAppMenu();
	await menu.getByRole("menuitem", { name: copy.settings.title }).click();
	await menu.waitFor({ state: "hidden" });
	const dialog = page.getByRole("dialog", { name: copy.settings.title });
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByRole("radiogroup", {
			name: copy.settings.spaceIndicators.label,
		}),
	).toBeVisible();

	await expectNoAxeViolations(page, testInfo, "settings");
});
