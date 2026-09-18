import { Button } from "@tabelo/ui/components/button";
import { DropdownMenuItem } from "@tabelo/ui/components/dropdown-menu";
import { IconTool } from "@tabler/icons-react";
import { copy } from "@/copy/copy";
import type { PreconditionRecovery } from "@/ui/precondition-recovery";

// One treatment for the command that repairs a refused choice, in the two
// interaction surfaces that can hold one. Both are ordinary enabled controls
// standing beside the disabled choice, never inside it: a disabled radio or
// menu item must not contain something that answers to activation.

export function RecoveryButton({
	recovery,
	target,
	onRun,
}: {
	readonly recovery: PreconditionRecovery;
	// What was refused, so several recovery commands in one list can be told
	// apart by name.
	readonly target: string;
	// The surface closes itself first, because recovery moves focus into the
	// grid and a dialog left open would take it straight back.
	readonly onRun: () => void;
}) {
	return (
		<Button
			variant="secondary"
			size="xs"
			// One step above the option block it sits on, so it reads as a
			// control rather than as part of the dimmed choice.
			className="bg-accent"
			aria-label={copy.a11y.fixTableFor(target)}
			aria-description={recovery.reason}
			onClick={() => {
				onRun();
				recovery.run();
			}}
		>
			<IconTool aria-hidden />
			{recovery.label}
		</Button>
	);
}

export function RecoveryMenuItem({
	recovery,
	target,
	onRun,
}: {
	readonly recovery: PreconditionRecovery;
	readonly target: string;
	readonly onRun: (command: () => void) => void;
}) {
	return (
		<DropdownMenuItem
			aria-label={copy.a11y.fixTableFor(target)}
			aria-description={recovery.reason}
			onClick={() => onRun(recovery.run)}
		>
			<IconTool aria-hidden />
			{recovery.label}
		</DropdownMenuItem>
	);
}
