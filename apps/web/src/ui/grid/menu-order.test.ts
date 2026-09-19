import { beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { useTabeloStore } from "@/state/store";
import { orderMenuGroups } from "./menu-order";
import { buildTableActions } from "./table-actions";

const initialState = useTabeloStore.getInitialState();

beforeEach(() => {
	useTabeloStore.setState(
		{
			...initialState,
			document: documentFromMatrix(
				[
					["name", "city"],
					["Ingrid", "Rio"],
					["Paulo", "Madrid"],
				],
				{ headerRow: true },
			),
		},
		true,
	);
});

function ids(
	groups: readonly {
		readonly id: string;
		readonly actions: readonly { readonly id: string }[];
	}[],
) {
	return groups.map((group) => [
		group.id,
		group.actions.map((action) => action.id),
	]);
}

describe("orderMenuGroups", () => {
	it("puts groups and their commands in the shared order, whatever order they were built in", () => {
		const ordered = orderMenuGroups([
			{
				id: "remove",
				actions: [{ id: "delete-columns" }, { id: "delete-rows" }],
			},
			{ id: "move", actions: [{ id: "move-right" }, { id: "move-up" }] },
			{ id: "insert", actions: [{ id: "insert-row-below" }] },
			{
				id: "clipboard",
				actions: [{ id: "paste" }, { id: "copy" }, { id: "cut" }],
			},
			{ id: "history", actions: [{ id: "redo" }, { id: "undo" }] },
		]);
		expect(ids(ordered)).toEqual([
			["clipboard", ["cut", "copy", "paste"]],
			["history", ["undo", "redo"]],
			["insert", ["insert-row-below"]],
			["move", ["move-up", "move-right"]],
			["remove", ["delete-rows", "delete-columns"]],
		]);
	});

	it("drops a group left with nothing a menu can support", () => {
		const ordered = orderMenuGroups([
			{ id: "sort", actions: [] },
			{ id: "edit", actions: [{ id: "clear" }] },
		]);
		expect(ordered.map((group) => group.id)).toEqual(["edit"]);
	});
});

// The Visual Table's three menus, in the order every table menu shares.
describe("the Visual Table's menus", () => {
	it("lists a cell's commands in the shared order", () => {
		expect(ids(buildTableActions({ axis: "cell" }))).toEqual([
			["clipboard", ["cut", "copy", "paste"]],
			["history", ["undo", "redo"]],
			[
				"insert",
				[
					"insert-row-above",
					"insert-row-below",
					"insert-column-left",
					"insert-column-right",
				],
			],
			["edit", ["duplicate", "clear"]],
			["move", ["move-up", "move-down", "move-left", "move-right"]],
			["fill", ["fill-up", "fill-down", "fill-left", "fill-right"]],
			["focus", ["focus-up", "focus-down", "focus-left", "focus-right"]],
			["remove", ["delete-rows", "delete-columns"]],
		]);
	});

	it("gives a column's menu its Sort, between Move and Delete", () => {
		expect(
			buildTableActions({ axis: "column", column: 0 }).map(({ id }) => id),
		).toEqual([
			"clipboard",
			"history",
			"insert",
			"edit",
			"move",
			"sort",
			"remove",
		]);
	});

	it("keeps a row's menu to its own axis", () => {
		expect(ids(buildTableActions({ axis: "row" }))).toEqual([
			["clipboard", ["cut", "copy", "paste"]],
			["history", ["undo", "redo"]],
			["insert", ["insert-row-above", "insert-row-below"]],
			["edit", ["duplicate", "clear"]],
			["move", ["move-up", "move-down"]],
			["remove", ["delete-rows"]],
		]);
	});

	it("offers Undo only once the document has a step to undo", () => {
		const undo = () =>
			buildTableActions({ axis: "cell" })
				.flatMap((group) => group.actions)
				.find((action) => action.id === "undo");
		expect(undo()?.disabled).toBe(true);
		useTabeloStore.getState().addRowBelow();
		expect(undo()?.disabled).toBe(false);
	});
});
