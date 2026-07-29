import { expect, test } from "./fixtures";

const source = [
	"| Number |",
	"| ---: |",
	...Array.from({ length: 30 }, (_, index) => `| ${index + 1} |`),
].join("\n");

test.use({ viewport: { width: 1280, height: 1800 } });

test("line numbers and the active gutter stay aligned across pane zoom levels", async ({
	tabelo,
}) => {
	const pane = tabelo.pane("markdown");
	const editor = tabelo.source("markdown");
	await editor.fill(source);
	await pane.locator(".cm-line").nth(31).click();

	const assertLineGeometry = async () => {
		await expect(pane.locator(".cm-line")).toHaveCount(32);
		await expect(
			pane
				.locator(".cm-lineNumbers .cm-gutterElement")
				.filter({
					hasText: /^32$/,
				})
				.last(),
		).toHaveClass(/cm-activeLineGutter/);

		const offsets = await pane.evaluate(() => {
			const lines = [...document.querySelectorAll<HTMLElement>(".cm-line")];
			const lineNumbers = [
				...document.querySelectorAll<HTMLElement>(
					".cm-lineNumbers .cm-gutterElement",
				),
			].filter(
				(element) =>
					/^\d+$/.test(element.textContent ?? "") &&
					element.getBoundingClientRect().height > 0,
			);

			return lineNumbers.map((lineNumber) => {
				const number = Number(lineNumber.textContent);
				const line = lines[number - 1];
				if (!line) throw new Error(`Missing source line ${number}.`);
				return Math.abs(
					line.getBoundingClientRect().top -
						lineNumber.getBoundingClientRect().top,
				);
			});
		});

		expect(Math.max(...offsets)).toBeLessThan(1);
	};

	await assertLineGeometry();
	await tabelo.page.keyboard.press("ControlOrMeta+=");
	await assertLineGeometry();
	await tabelo.page.keyboard.press("ControlOrMeta+=");
	await tabelo.page.keyboard.press("ControlOrMeta+=");
	await assertLineGeometry();
	await tabelo.page.keyboard.press("ControlOrMeta+0");
	for (let step = 0; step < 5; step += 1) {
		await tabelo.page.keyboard.press("ControlOrMeta+-");
	}
	await assertLineGeometry();
	for (let step = 0; step < 15; step += 1) {
		await tabelo.page.keyboard.press("ControlOrMeta+=");
	}
	await assertLineGeometry();
});
