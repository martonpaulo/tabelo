import { Button } from "@tabelo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Input } from "@tabelo/ui/components/input";
import { Textarea } from "@tabelo/ui/components/textarea";
import { type FormEvent, useId, useRef, useState } from "react";
import {
	type AgentConnectionError,
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
	DialogAlternative,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { FormFailure, FormField } from "@/ui/primitives/form-field";
import { useContentWhileOpen } from "@/ui/primitives/use-content-while-open";

const connectionErrorCopy: Record<AgentConnectionError, string> = {
	"invalid-descriptor": copy.agent.invalidDescriptor,
	"connection-failed": copy.agent.connectionFailed,
	"invalid-response": copy.agent.invalidResponse,
	"session-ended": copy.agent.sessionEnded,
	uncertain: copy.agent.uncertain,
};

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
	const inputRef = useRef<HTMLInputElement>(null);
	const paired = state.status === "connected" || state.status === "paused";
	// A malformed code is the field's own error; any other reason is about the
	// helper or the session, so the code stays valid and the form says it
	// (#451).
	const descriptorError =
		state.error === "invalid-descriptor"
			? connectionErrorCopy[state.error]
			: null;
	const connectionFailure =
		state.error !== null && state.error !== "invalid-descriptor"
			? connectionErrorCopy[state.error]
			: null;
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
			aria-labelledby={titleId}
			aria-describedby={descriptionId}
			initialFocus={paired ? undefined : inputRef}
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
						<FormField label={copy.agent.descriptor} error={descriptorError}>
							{(control) => (
								<Input
									{...control}
									ref={inputRef}
									value={descriptor}
									autoComplete="off"
									spellCheck={false}
									onChange={(event) => setDescriptor(event.target.value)}
								/>
							)}
						</FormField>
						<p className="text-muted-foreground text-sm">
							{copy.agent.disclosure}
						</p>
						<details className="text-sm">
							<summary className="cursor-pointer font-medium">
								{copy.agent.setupTitle}
							</summary>
							<div className="mt-3 grid gap-3">
								<p className="text-muted-foreground text-sm">
									{copy.agent.setupRequirements}
								</p>
								<Textarea
									readOnly
									rows={4}
									wrap="off"
									aria-label={copy.agent.setupTitle}
									value={copy.agent.setupCommands}
									className="font-mono text-sm"
								/>
								<Button
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
								<p className="text-muted-foreground text-sm">
									{copy.agent.pairInstructions}
								</p>
							</div>
						</details>
					</>
				)}
				{connectionFailure ? (
					<FormFailure>{connectionFailure}</FormFailure>
				) : null}
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					{paired ? (
						<>
							<DialogAlternative
								type="button"
								onClick={() => {
									disconnectAgent();
									changeOpen(false);
								}}
							>
								{copy.agent.disconnect}
							</DialogAlternative>
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
								: copy.agent.connectAction}
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
