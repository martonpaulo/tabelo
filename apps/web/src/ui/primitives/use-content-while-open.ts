import { type ReactNode, useRef } from "react";

// A dialog stays on screen while it animates closed, and the command that
// closed it has usually just changed the state its content is derived from:
// the pane now shows the chosen view, the subject prop is cleared. Rendering
// the content again mid-close shows the dialog changing under the user, a line
// dropping out, the selection jumping, the chosen option turning "In use".
// The content a dialog last showed while open is what it shows until it has
// gone. The element is reused as is, so React does not re-render it.
export function useContentWhileOpen(
	open: boolean,
	content: ReactNode,
): ReactNode {
	const shown = useRef(content);
	if (open) shown.current = content;
	return shown.current;
}
