import { copy } from "@/ui/copy";
import { expect, test } from "./fixtures";

test("source focus stays visible and reduced motion keeps the cursor solid", async ({
	page,
	tabelo,
}) => {
	await page.emulateMedia({
		colorScheme: "light",
		reducedMotion: "no-preference",
	});

	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	const cursorLayer = pane.locator(".cm-cursorLayer");
	await editor.focus();
	const normalCursorAnimation = await cursorLayer.evaluate((element) => {
		const style = getComputedStyle(element);
		return { name: style.animationName, duration: style.animationDuration };
	});
	expect(normalCursorAnimation.name).not.toBe("none");
	expect(normalCursorAnimation.duration).not.toBe("0.00001s");

	const lightFocus = await pane.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			shadow: style.boxShadow,
		};
	});
	expect(lightFocus.shadow).toContain("inset");
	await expect(pane.locator(".cm-content")).toHaveCSS("outline-style", "none");

	await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
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
				.getByRole("button", { name: copy.actions.openAppMenu })
				.evaluate((element) =>
					Number.parseFloat(getComputedStyle(element).transitionDuration),
				),
		)
		.toBeLessThan(0.001);

	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await editor.focus();
	const darkFocus = await pane.evaluate(
		(element) => getComputedStyle(element).boxShadow,
	);
	expect(darkFocus).toContain("inset");
	expect(darkFocus).not.toBe(lightFocus.shadow);
});
