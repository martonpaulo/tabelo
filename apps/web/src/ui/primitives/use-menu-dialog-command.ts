import { useRef, useState } from "react";

// A menu and the dialog it launches are sequential interaction layers. Waiting
// for the menu primitive's close transition prevents a modal from appearing
// over a still-visible menu, and keeping this sequence here stops command
// surfaces from implementing subtly different timing.
export function useMenuDialogCommand() {
	const [open, setOpen] = useState(false);
	const pendingCommand = useRef<(() => void) | null>(null);

	const runAfterClose = (command: () => void) => {
		pendingCommand.current = command;
		setOpen(false);
	};

	const onOpenChangeComplete = (isOpen: boolean) => {
		if (isOpen || !pendingCommand.current) return;
		const command = pendingCommand.current;
		pendingCommand.current = null;
		command();
	};

	return {
		open,
		onOpenChange: setOpen,
		onOpenChangeComplete,
		runAfterClose,
	} as const;
}
