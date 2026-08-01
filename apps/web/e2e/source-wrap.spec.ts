import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

const longValue = Array.from(
	{ length: 9 },
	() => "A long source value must overflow until wrapping is requested",
).join(" ");

async function wrappingState(pane: import("@playwright/test").Locator) {
	return pane.evaluate((element) => {
		const scroller = element.querySelector<HTMLElement>(".cm-scroller");
		const content = element.querySelector<HTMLElement>(".cm-content");
		if (!scroller || !content) return null;
		const scrollerStyle = getComputedStyle(scroller);
		return {
			whiteSpace: getComputedStyle(content).whiteSpace,
			overflowX: scrollerStyle.overflowX,
			overflowY: scrollerStyle.overflowY,
			hasHorizontalOverflow: scroller.scrollWidth > scroller.clientWidth,
			hasVerticalOverflow: scroller.scrollHeight > scroller.clientHeight,
		};
	});
}

test("source panes scroll both axes by default and persist wrapping independently", async ({
	tabelo,
}) => {
	await tabelo.paste(
		["Column 1", ...Array.from({ length: 50 }, () => longValue)].join("\n"),
	);
	await tabelo.choosePaneView("markdown", "tsv");

	await expect
		.poll(() => wrappingState(tabelo.pane("tsv")))
		.toMatchObject({
			whiteSpace: "pre",
			overflowX: "auto",
			overflowY: "auto",
			hasHorizontalOverflow: true,
			hasVerticalOverflow: true,
		});

	let menu = await tabelo.openPaneMenu("tsv");
	const wrap = menu.getByRole("menuitemcheckbox", {
		name: copy.workspace.wrapSource,
	});
	await expect(wrap).not.toBeChecked();
	await wrap.click();
	await expect(wrap).toBeChecked();
	await expect
		.poll(() => wrappingState(tabelo.pane("tsv")))
		.toMatchObject({ whiteSpace: "break-spaces" });
	await tabelo.paneMenuTrigger("tsv").click();

	await tabelo.addViewBySplit("tsv", "bottom", "csv");
	menu = await tabelo.openPaneMenu("csv");
	await expect(
		menu.getByRole("menuitemcheckbox", {
			name: copy.workspace.wrapSource,
		}),
	).not.toBeChecked();
	await tabelo.paneMenuTrigger("csv").click();

	await tabelo.page.reload();
	await expect(tabelo.workspace).toBeVisible();
	menu = await tabelo.openPaneMenu("tsv");
	await expect(
		menu.getByRole("menuitemcheckbox", {
			name: copy.workspace.wrapSource,
		}),
	).toBeChecked();
	await tabelo.paneMenuTrigger("tsv").click();
	menu = await tabelo.openPaneMenu("csv");
	await expect(
		menu.getByRole("menuitemcheckbox", {
			name: copy.workspace.wrapSource,
		}),
	).not.toBeChecked();
});

test("toggling source wrapping preserves the editor's local undo history", async ({
	tabelo,
}) => {
	const source = tabelo.source("markdown");
	await source.fill("| Name |\n| --- |\n| Initial |");
	await expect(tabelo.cell(1, 1)).toHaveText("Initial");
	await source.press("End");
	await source.press("ArrowLeft");
	await source.press("ArrowLeft");
	await source.press("X");
	await expect(tabelo.cell(1, 1)).toHaveText("InitialX");

	const menu = await tabelo.openPaneMenu("markdown");
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await tabelo.paneMenuTrigger("markdown").click();
	await source.focus();
	await source.press("ControlOrMeta+z");

	await expect(tabelo.cell(1, 1)).toHaveText("Initial");
});
