import type { CellRect } from "@/core/selection";
import type { FindState } from "./store";

// "Nothing has been copied." One shared value rather than a fresh array each
// time, so clearing a mark that was already clear leaves state referentially
// identical and nothing downstream sees a change that did not happen.
export const NO_COPIED_RANGES: readonly CellRect[] = [];

// "No pane has a find bar open."
export const NO_FINDS: Readonly<Record<string, FindState>> = {};
