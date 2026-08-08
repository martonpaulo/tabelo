import { copy } from "@/copy/copy";
import { expect, test } from "./fixtures";

test("Move pane cancellation changes nothing and restores focus", async ({
	tabelo,
}) => {
	const before = await tabelo.paneArea("markdown");
	const dialog = await tabelo.openMovePaneDialog("markdown");
	await expect(dialog.getByRole("radio")).toHaveCount(1);

	await dialog.getByRole("button", { name: copy.actions.cancel }).click();

	await expect(dialog).toBeHidden();
	await expect(tabelo.paneMenuTrigger("markdown")).toBeFocused();
	expect(await tabelo.paneArea("markdown")).toEqual(before);
});

test("Move pane updates the grid viewport when its slot shape changes", async ({
	tabelo,
}) => {
	await tabelo.chooseLayout("top-split");
	const viewportWidth = () =>
		tabelo
			.grid()
			.evaluate(
				(element) =>
					element.closest<HTMLElement>('[data-slot="panel-body"]')
						?.clientWidth ?? 0,
			);
	const before = await viewportWidth();
	const dialog = await tabelo.openMovePaneDialog("grid");
	await dialog
		.getByRole("radio", {
			name: copy.panePositions["bottom-full-width"],
		})
		.click();
	await dialog.getByRole("button", { name: copy.workspace.movePane }).click();

	await expect(tabelo.cell(1, 1)).toBeVisible();
	await expect.poll(viewportWidth).toBeGreaterThan(before);
	await expect(tabelo.pane("grid")).toHaveAttribute("aria-current", "true");
});

test("Move pane carries an invalid draft and pane preferences through an asymmetric layout and reload", async ({
	page,
	tabelo,
}) => {
	await tabelo.chooseLayout("top-split");
	const invalid = `| Name | Notes |\n| not a divider | ${"Long text ".repeat(30)} |\n| Ingrid | Rio |`;
	await tabelo.source("markdown").fill(invalid);
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);

	let menu = await tabelo.openPaneMenu("markdown");
	await menu
		.getByRole("menuitem", { name: copy.workspace.zoomIn, exact: true })
		.click();
	await menu
		.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource })
		.click();
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();

	const paneId = await tabelo.pane("markdown").getAttribute("data-pane-id");
	const editorWidthBefore = await tabelo
		.pane("markdown")
		.locator(".cm-editor")
		.evaluate((element) => element.clientWidth);
	const dialog = await tabelo.openMovePaneDialog("markdown");
	await expect(dialog.getByRole("radio")).toHaveCount(2);
	const destination = dialog.getByRole("radio", {
		name: copy.panePositions["bottom-full-width"],
	});
	await destination.click();
	await dialog.getByRole("button", { name: copy.workspace.movePane }).click();

	await expect(dialog).toBeHidden();
	await expect(tabelo.paneMenuTrigger("markdown")).toBeFocused();
	await expect(tabelo.pane("markdown")).toHaveAttribute("aria-current", "true");
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);
	const movedArea = await tabelo.paneArea("markdown");
	expect(movedArea.rowStart).toBe(2);
	expect(movedArea.columnStart).toBe(1);
	expect(movedArea.columnEnd).toBe(3);
	await expect
		.poll(() =>
			tabelo
				.pane("markdown")
				.locator(".cm-editor")
				.evaluate((element) => element.clientWidth),
		)
		.toBeGreaterThan(editorWidthBefore);

	menu = await tabelo.openPaneMenu("markdown");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeEnabled();
	await expect(
		menu.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource }),
	).toBeChecked();
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();

	await expect
		.poll(() =>
			page.evaluate((id) => {
				const raw = localStorage.getItem("tabelo.document");
				if (!raw) return null;
				const stored = JSON.parse(raw) as {
					workspace: { panes: { id: string; slots: string[] }[] };
					draft: { paneId: string; text: string } | null;
				};
				return {
					slots: stored.workspace.panes
						.find((pane) => pane.id === id)
						?.slots.join(""),
					draftPaneId: stored.draft?.paneId,
					draftText: stored.draft?.text,
				};
			}, paneId),
		)
		.toEqual({ slots: "cd", draftPaneId: paneId, draftText: invalid });

	await page.reload();
	await expect(tabelo.workspace).toBeVisible();
	await expect(tabelo.source("markdown")).toHaveAttribute(
		"aria-invalid",
		"true",
	);
	expect(await tabelo.paneArea("markdown")).toMatchObject({
		rowStart: 2,
		columnStart: 1,
		columnEnd: 3,
	});
	await expect(tabelo.pane("markdown")).toHaveAttribute("aria-current", "true");
	menu = await tabelo.openPaneMenu("markdown");
	await expect(
		menu.getByRole("menuitem", { name: copy.workspace.resetZoom }),
	).toBeEnabled();
	await expect(
		menu.getByRole("menuitemcheckbox", { name: copy.workspace.wrapSource }),
	).toBeChecked();
});
