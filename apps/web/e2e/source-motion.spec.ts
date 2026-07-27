import { expect, test } from "./fixtures";

test("source focus stays visible and reduced motion keeps the cursor solid", async ({
	page,
	tabelo,
}) => {
	await page.getByRole("button", { name: /^Theme:/ }).click();
	await page.getByRole("menuitem", { name: "Light" }).click();

	const pane = tabelo.pane("Markdown");
	const editor = tabelo.source("Markdown");
	const editorFrame = pane.locator(".cm-editor");
	const cursorLayer = pane.locator(".cm-cursorLayer");
	await editor.focus();
	const normalCursorAnimation = await cursorLayer.evaluate((element) => {
		const style = getComputedStyle(element);
		return { name: style.animationName, duration: style.animationDuration };
	});
	expect(normalCursorAnimation.name).not.toBe("none");
	expect(normalCursorAnimation.duration).not.toBe("0.00001s");

	const lightFocus = await editorFrame.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			style: style.outlineStyle,
			width: style.outlineWidth,
			color: style.outlineColor,
		};
	});
	expect(lightFocus.style).toBe("solid");
	expect(lightFocus.width).toBe("2px");

	await page.emulateMedia({ reducedMotion: "reduce" });
	await expect
		.poll(() =>
			cursorLayer.evaluate(
				(element) => getComputedStyle(element).animationName,
			),
		)
		.toBe("none");
	await expect
		.poll(() =>
			page
				.getByRole("button", { name: /^Theme:/ })
				.evaluate((element) =>
					Number.parseFloat(getComputedStyle(element).transitionDuration),
				),
		)
		.toBeLessThan(0.001);

	await page.getByRole("button", { name: /^Theme:/ }).click();
	await page.getByRole("menuitem", { name: "Dark" }).click();
	await editor.focus();
	const darkFocusColor = await editorFrame.evaluate(
		(element) => getComputedStyle(element).outlineColor,
	);
	expect(darkFocusColor).not.toBe("rgba(0, 0, 0, 0)");
	expect(darkFocusColor).not.toBe(lightFocus.color);
});
