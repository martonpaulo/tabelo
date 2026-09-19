import { createContext, useContext } from "react";

// Whether this pane's current source buffer has its format's structural
// assistance switched on (#297), and how the editor tells the pane that the
// buffer it was editing has been replaced from outside.
//
// The pane owns the switch because its menu shows it; the editor only reads it.
// It is transient on purpose: never workspace state, never persisted, and gone
// with the buffer it was set for. See docs/design-system/2-tokens.md, "Structural
// assistance can always be switched off".
export interface PaneAssistance {
	readonly enabled: boolean;
	readonly onBufferReplaced: () => void;
}

export const PaneAssistanceContext = createContext<PaneAssistance>({
	enabled: true,
	onBufferReplaced: () => {},
});

export function usePaneAssistance(): PaneAssistance {
	return useContext(PaneAssistanceContext);
}
