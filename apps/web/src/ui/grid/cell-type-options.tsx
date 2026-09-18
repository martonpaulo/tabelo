import {
	IconCircleCheck,
	IconCircleOff,
	IconHash,
	IconLetterCase,
} from "@tabler/icons-react";
import { copy } from "@/copy/copy";
import type { CellValueType, ExpectedColumnType } from "@/core/types";

export const expectedTypeOptions: readonly {
	readonly value: ExpectedColumnType;
	readonly label: string;
	readonly icon: typeof IconLetterCase;
}[] = [
	{ value: "text", label: copy.cellTypes.expected.text, icon: IconLetterCase },
	{ value: "number", label: copy.cellTypes.expected.number, icon: IconHash },
	{
		value: "boolean",
		label: copy.cellTypes.expected.boolean,
		icon: IconCircleCheck,
	},
];

export const cellTypeOptions: readonly {
	readonly value: CellValueType;
	readonly label: string;
	readonly icon: typeof IconLetterCase;
}[] = [
	{ value: "string", label: copy.cellTypes.real.string, icon: IconLetterCase },
	{ value: "number", label: copy.cellTypes.real.number, icon: IconHash },
	{
		value: "boolean",
		label: copy.cellTypes.real.boolean,
		icon: IconCircleCheck,
	},
	{ value: "null", label: copy.cellTypes.real.null, icon: IconCircleOff },
];
