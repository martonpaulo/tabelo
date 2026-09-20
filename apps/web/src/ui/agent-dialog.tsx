import { Button } from "@tabelo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Input } from "@tabelo/ui/components/input";
import { Label } from "@tabelo/ui/components/label";
import { Textarea } from "@tabelo/ui/components/textarea";
import { type FormEvent, useId, useRef, useState } from "react";
import {
	connectAgent,
	disconnectAgent,
	pauseAgent,
	useAgentConnection,
} from "@/agent/connection";
import { copy } from "@/copy/copy";
import { writeClipboardText } from "@/platform/clipboard";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { useContentWhileOpen } from "@/ui/primitives/use-content-while-open";

export function AgentDialog({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const [descriptor, setDescriptor] = useState("");
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState(false);
	const state = useAgentConnection();
	const titleId = useId();
	const descriptionId = useId();
	const inputId = useId();
	const errorId = useId();
	const setupRef = useRef<HTMLButtonElement>(null);
	const paired = state.status === "connected" || state.status === "paused";
	const title = paired
		? state.status === "paused"
			? copy.agent.paused
			: copy.agent.connected
		: copy.agent.connect;
	const changeOpen = (next: boolean) => {
		if (!next) {
			setDescriptor("");
			setCopied(false);
			setCopyError(false);
			if (useAgentConnection.getState().status === "connecting")
				disconnectAgent();
		}
		onOpenChange(next);
	};
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (state.status === "connecting") return;
		if (await connectAgent(descriptor)) changeOpen(false);
	};
	const content = useContentWhileOpen(
		open,
		<DialogContent
			width="wide"
			aria-labelledby={titleId}
			aria-describedby={descriptionId}
			initialFocus={paired ? undefined : setupRef}
		>
			<form className="grid gap-4" onSubmit={submit}>
				<DialogHeader>
					<DialogTitle id={titleId}>{title}</DialogTitle>
					<DialogDescription id={descriptionId}>
						{paired ? copy.agent.connectedDescription : copy.agent.description}
					</DialogDescription>
				</DialogHeader>
				{paired ? null : (
					<>
						<div className="grid gap-2">
							<h3 className="font-medium">{copy.agent.setupTitle}</h3>
							<p className="text-muted-foreground text-sm">
								{copy.agent.setupRequirements}
							</p>
							<Textarea
								readOnly
								rows={4}
								wrap="off"
								aria-label={copy.agent.setupTitle}
								value={copy.agent.setupCommands}
								className="font-mono text-xs"
							/>
							<Button
								ref={setupRef}
								type="button"
								variant="outline"
								className="justify-self-start"
								onClick={async () => {
									const outcome = await writeClipboardText(
										copy.agent.setupCommands,
									);
									setCopied(outcome.ok);
									setCopyError(!outcome.ok);
									if (outcome.ok)
										useTabeloStore
											.getState()
											.announceStatus(copy.agent.commandsCopied);
								}}
							>
								{copied ? copy.agent.commandsCopied : copy.agent.copyCommands}
							</Button>
							{copyError ? (
								<p role="alert" className="text-destructive text-sm">
									{copy.agent.copyCommandsFailed}
								</p>
							) : null}
							<p className="text-muted-foreground text-sm">
								{copy.agent.setupExisting}
							</p>
						</div>
						<div className="grid gap-2">
							<h3 className="font-medium">{copy.agent.pairTitle}</h3>
							<p className="text-muted-foreground text-sm">
								{copy.agent.pairInstructions}
							</p>
						</div>
						<p className="text-muted-foreground text-sm">
							{copy.agent.disclosure}
						</p>
						<div className="grid gap-2">
							<Label htmlFor={inputId}>{copy.agent.descriptor}</Label>
							<Input
								id={inputId}
								value={descriptor}
								autoComplete="off"
								spellCheck={false}
								aria-invalid={state.error ? true : undefined}
								aria-describedby={state.error ? errorId : undefined}
								onChange={(event) => setDescriptor(event.target.value)}
							/>
						</div>
					</>
				)}
				{state.error ? (
					<p id={errorId} role="alert" className="text-destructive text-sm">
						{state.error}
					</p>
				) : null}
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					{paired ? (
						<>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									disconnectAgent();
									changeOpen(false);
								}}
							>
								{copy.agent.disconnect}
							</Button>
							<DialogConfirm
								type="button"
								onClick={() => {
									pauseAgent(state.status !== "paused");
									changeOpen(false);
								}}
							>
								{state.status === "paused"
									? copy.agent.resume
									: copy.agent.pause}
							</DialogConfirm>
						</>
					) : (
						<DialogConfirm
							type="submit"
							disabledReason={
								state.status === "connecting"
									? copy.agent.connecting
									: descriptor.trim() === ""
										? copy.agent.invalidDescriptor
										: undefined
							}
						>
							{state.status === "connecting"
								? copy.agent.connecting
								: copy.agent.connect}
						</DialogConfirm>
					)}
				</DialogActions>
			</form>
		</DialogContent>,
	);
	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			{content}
		</Dialog>
	);
}
