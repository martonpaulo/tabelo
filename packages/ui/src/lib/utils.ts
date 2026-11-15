import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The selection edge's width utilities (`border-edge`, `outline-edge`,
// `outline-offset-edge`) are custom theme values tailwind-merge cannot read
// from the CSS. Without naming them here it files `border-edge` as a border
// colour and drops the colour class beside it.
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"border-w": [{ border: ["edge"] }],
			"border-w-t": [{ "border-t": ["edge"] }],
			"border-w-r": [{ "border-r": ["edge"] }],
			"border-w-b": [{ "border-b": ["edge"] }],
			"border-w-l": [{ "border-l": ["edge"] }],
			"outline-w": [{ outline: ["edge"] }],
			"outline-offset": [{ "outline-offset": ["edge"] }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
