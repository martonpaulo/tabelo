import { ALargeSmall, CircleSlash2, Hash, ToggleLeft } from "lucide-react";
import { copy } from "@/copy/copy";
import type { CellValueType, ExpectedColumnType } from "@/core/types";

export const expectedTypeOptions: readonly {
	readonly value: ExpectedColumnType;
	readonly label: string;
	readonly icon: typeof ALargeSmall;
}[] = [
	{ value: "text", label: copy.cellTypes.expected.text, icon: ALargeSmall },
	{ value: "number", label: copy.cellTypes.expected.number, icon: Hash },
	{
		value: "boolean",
		label: copy.cellTypes.expected.boolean,
		icon: ToggleLeft,
	},
];

export const cellTypeOptions: readonly {
	readonly value: CellValueType;
	readonly label: string;
	readonly icon: typeof ALargeSmall;
}[] = [
	{ value: "string", label: copy.cellTypes.real.string, icon: ALargeSmall },
	{ value: "number", label: copy.cellTypes.real.number, icon: Hash },
	{ value: "boolean", label: copy.cellTypes.real.boolean, icon: ToggleLeft },
	{ value: "null", label: copy.cellTypes.real.null, icon: CircleSlash2 },
];
