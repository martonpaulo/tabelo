// @vitest-environment happy-dom
// Fit column to content reads the rendered table and nothing else, so its
// tests need a DOM. `scrollWidth` is not laid out by a test DOM, so it is
// stubbed with a width each element states for itself: the point under test is
// which elements get measured and with which style, not what a real font does.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { measureColumnFitWidth } from "./column-fit";

const ROOT_FONT_SIZE = 16;

let originalScrollWidth: PropertyDescriptor | undefined;

beforeEach(() => {
	originalScrollWidth = Object.getOwnPropertyDescriptor(
		window.HTMLElement.prototype,
		"scrollWidth",
	);
	// One "character" per unit of the element's own font size, so a width can
	// only be right when the element was both appended and given its own style.
	Object.defineProperty(window.HTMLElement.prototype, "scrollWidth", {
		configurable: true,
		get(this: HTMLElement) {
			const size = Number.parseFloat(this.style.fontSize || "0");
			return size * (this.textContent?.length ?? 0);
		},
	});
	document.documentElement.style.fontSize = `${ROOT_FONT_SIZE}px`;
});

afterEach(() => {
	if (originalScrollWidth) {
		Object.defineProperty(
			window.HTMLElement.prototype,
			"scrollWidth",
			originalScrollWidth,
		);
	}
	document.body.replaceChildren();
});

// A one-column grid: the header cell, then one data cell per value. Each
// content element carries its own font size, which is what a header in a
// heavier or larger type looks like to the measurement.
function renderColumn(
	header: { text: string; fontSize: number },
	cells: readonly { text: string; fontSize: number }[],
): HTMLTableElement {
	const table = document.createElement("table");
	const content = (value: { text: string; fontSize: number }) => {
		const span = document.createElement("span");
		span.setAttribute("data-column-content", "0");
		span.style.fontSize = `${value.fontSize}px`;
		span.textContent = value.text;
		return span;
	};

	const head = document.createElement("thead");
	const headRow = document.createElement("tr");
	const headCell = document.createElement("th");
	headCell.append(content(header));
	headRow.append(headCell);
	head.append(headRow);

	const body = document.createElement("tbody");
	for (const value of cells) {
		const row = document.createElement("tr");
		const cell = document.createElement("td");
		cell.append(content(value));
		row.append(cell);
		body.append(row);
	}

	table.append(head, body);
	document.body.append(table);
	return table;
}

describe("measureColumnFitWidth", () => {
	it("fits the widest cell of the column, not only the first", () => {
		const table = renderColumn({ text: "city", fontSize: 10 }, [
			{ text: "Rio", fontSize: 10 },
			{ text: "Buenos Aires", fontSize: 10 },
			{ text: "Tokyo", fontSize: 10 },
		]);

		// 12 characters at 10 units each, expressed in the root's rem.
		expect(measureColumnFitWidth(table, 0, 1)).toBe(120 / ROOT_FONT_SIZE);
	});

	it("measures every cell against its own type, not the first cell's", () => {
		const table = renderColumn({ text: "city", fontSize: 20 }, [
			{ text: "Buenos Aires", fontSize: 10 },
		]);

		// The header is the first element found, and its larger type must not be
		// lent to the data cell below it: 12 characters at 10, not at 20.
		expect(measureColumnFitWidth(table, 0, 1)).toBe(120 / ROOT_FONT_SIZE);
	});

	it("leaves nothing of its own behind in the document", () => {
		const table = renderColumn({ text: "city", fontSize: 10 }, [
			{ text: "Rio", fontSize: 10 },
			{ text: "Buenos Aires", fontSize: 10 },
		]);

		measureColumnFitWidth(table, 0, 1);

		expect(document.body.children).toHaveLength(1);
		expect(document.body.firstElementChild).toBe(table);
		expect(table.querySelectorAll("[data-column-content]")).toHaveLength(3);
	});

	it("reports nothing for a column the table does not render", () => {
		const table = renderColumn({ text: "city", fontSize: 10 }, [
			{ text: "Rio", fontSize: 10 },
		]);

		expect(measureColumnFitWidth(table, 1, 1)).toBeUndefined();
	});
});
