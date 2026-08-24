import { copy } from "@/copy/copy";
import { samplePerson } from "@/core/sample-data";
import type { ViewId } from "@/views/types";
import { expect, test } from "./fixtures";
import type { TabeloPage } from "./helpers";

// The weight the header treatment carries, so a header cell stays distinct
// without depending on colour. The value lives in the editor theme; this is
// only the threshold that separates "emphasised" from "normal".
const HEADER_WEIGHT = 600;

const first = samplePerson(0);

// JSON keys every record on the headers, so it refuses a table with an unnamed
// column. Naming all three is what lets one seeded table serve every view.
async function nameColumns(tabelo: TabeloPage): Promise<void> {
	for (const [index, header] of ["name", "city", "role"].entries()) {
		await tabelo.editHeader(index + 1, header);
	}
	await tabelo.editCell(1, 1, first.name);
}

test("JSON scalar roles use distinct semantic and non-colour treatments", async ({
	tabelo,
}) => {
	await tabelo.importFile(
		"typed.json",
		'[{"text":"alpha","qty":17,"ok":true,"note":null}]',
		"application/json",
	);
	await tabelo.choosePaneView("markdown", "json");
	const pane = tabelo.pane("json");
	await expect(pane.locator(".cm-line span").first()).toBeVisible();

	const tokens = await pane.locator(".cm-line span").evaluateAll((spans) =>
		spans.map((span) => {
			const style = getComputedStyle(span);
			return {
				text: span.textContent ?? "",
				color: style.color,
				fontStyle: style.fontStyle,
				fontWeight: Number.parseInt(style.fontWeight, 10),
			};
		}),
	);
	const token = (text: string) => tokens.find((entry) => entry.text === text);
	const string = token('"alpha"');
	const number = token("17");
	const boolean = token("true");
	const nullValue = token("null");

	expect(string).toBeDefined();
	expect(number).toBeDefined();
	expect(boolean).toBeDefined();
	expect(nullValue).toBeDefined();
	expect(
		new Set([string?.color, number?.color, boolean?.color, nullValue?.color])
			.size,
	).toBe(4);
	expect(number?.fontWeight).toBeGreaterThanOrEqual(HEADER_WEIGHT);
	expect(boolean?.fontWeight).toBeGreaterThanOrEqual(HEADER_WEIGHT);
	expect(boolean?.fontStyle).toBe("italic");
	expect(nullValue?.fontStyle).toBe("italic");
});

test("every source format marks its header cells in the tokens", async ({
	tabelo,
}) => {
	await nameColumns(tabelo);

	// The header used to be a background band on one line, which competed with
	// the selection tint drawn over it and had no answer for JSON, where the
	// header names are keys repeated inside every record.
	const expectHeaderTokens = async (view: ViewId) => {
		const pane = tabelo.pane(view);
		await expect(pane.locator(".cm-line span").first()).toBeVisible();
		const weights = await pane.locator(".cm-line span").evaluateAll((spans) =>
			spans.map((span) => ({
				text: span.textContent ?? "",
				weight: Number.parseInt(getComputedStyle(span).fontWeight, 10),
			})),
		);
		const emphasised = weights.filter(({ weight }) => weight >= HEADER_WEIGHT);
		expect(emphasised.length).toBeGreaterThan(0);
		expect(emphasised.some(({ text }) => text.includes("name"))).toBe(true);
	};

	await expectHeaderTokens("markdown");

	await tabelo.choosePaneView("markdown", "csv");
	await expectHeaderTokens("csv");

	await tabelo.choosePaneView("csv", "tsv");
	await expectHeaderTokens("tsv");

	await tabelo.choosePaneView("tsv", "jira");
	await expectHeaderTokens("jira");

	await tabelo.choosePaneView("jira", "json");
	await expectHeaderTokens("json");

	await tabelo.choosePaneView("json", "html");
	await expect(
		tabelo.pane("html").locator(".cm-tableHeaderCell").first(),
	).toBeVisible();
});

test("an HTML closing tag does not read as an opening one", async ({
	tabelo,
}) => {
	await nameColumns(tabelo);
	await tabelo.choosePaneView("markdown", "html");
	const pane = tabelo.pane("html");
	await expect(pane.locator(".cm-line span").first()).toBeVisible();

	const spans = await pane.locator(".cm-line span").evaluateAll((nodes) =>
		nodes.map((node) => ({
			text: node.textContent ?? "",
			color: getComputedStyle(node).color,
		})),
	);

	// The delimiters are their own tokens: no span may carry a bracket and an
	// element name together, which is exactly what made `<th>` and `</th>`
	// render identically.
	expect(
		spans.filter(({ text }) => /[<>]/.test(text) && /\w/.test(text)),
	).toEqual([]);

	const delimiter = spans.find(({ text }) => text.includes("</"));
	const name = spans.find(({ text }) => text === "th");
	expect(delimiter).toBeDefined();
	expect(name).toBeDefined();
	expect(delimiter?.color).not.toBe(name?.color);
});

test("the first grid row is the numbered header row", async ({ tabelo }) => {
	await expect(
		tabelo.grid().getByRole("rowheader", { name: copy.a11y.headerRow }),
	).toHaveText("1");
	await expect(
		tabelo.grid().getByRole("rowheader", { name: copy.a11y.rowNumber(0) }),
	).toContainText("2");
});

test("grid headers show alignment without an extra icon", async ({
	tabelo,
}) => {
	const header = tabelo.header(1);
	await expect(header.locator("svg")).toHaveCount(0);

	await tabelo.setColumnAlignment(1, copy.actions.alignRight);

	await expect(header).toHaveCSS("text-align", "right");
});
