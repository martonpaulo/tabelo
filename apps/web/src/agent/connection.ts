import {
	AGENT_LIMITS,
	encodedBytes,
	pairedSchema,
	pairingSchema,
	requestSchema,
	WIRE_VERSION,
} from "@tabelo/agent-protocol";
import { create } from "zustand";
import { copy } from "@/copy/copy";
import { LIBRARY_KEY } from "@/persistence/schema";
import { useTabeloStore } from "@/state/store";
import { AgentSession } from "./session";

type ConnectionState = {
	status: "disconnected" | "connecting" | "connected" | "paused";
	error: string | null;
	lastOutcome: string | null;
};
export const useAgentConnection = create<ConnectionState>(() => ({
	status: "disconnected",
	error: null,
	lastOutcome: null,
}));
let cleanup: (() => void) | null = null;
let activeSession: AgentSession | null = null;

export function disconnectAgent(): void {
	cleanup?.();
}

export function pauseAgent(paused: boolean): void {
	activeSession?.pause(paused);
}

// The unfinished input the DOM knows about and the store does not. Only a
// gesture holding pointer capture counts as a pointer gesture: every drag that
// changes something on move or on drop (fill, reorder, column and split resize)
// captures its pointer, while a click or drag-select that only moves the
// selection does not (#472). Capture is granted at the gesture's first pointer
// event after the request, so a press that has not moved changes nothing and
// does not block yet. The browser releases capture itself on pointerup,
// pointercancel or removal, so this state cannot outlive the gesture the way a
// pointerdown flag could.
export function watchInputGuards(doc: Document): {
	busy: () => string | null;
	dispose: () => void;
} {
	let composing = false;
	const captured = new Set<number>();
	const compositionStart = () => {
		composing = true;
	};
	const compositionEnd = () => {
		composing = false;
	};
	const captureGot = (event: PointerEvent) => {
		captured.add(event.pointerId);
	};
	const captureLost = (event: PointerEvent) => {
		captured.delete(event.pointerId);
	};
	doc.addEventListener("compositionstart", compositionStart, true);
	doc.addEventListener("compositionend", compositionEnd, true);
	doc.addEventListener("gotpointercapture", captureGot, true);
	doc.addEventListener("lostpointercapture", captureLost, true);
	return {
		busy: () => {
			if (composing) return "composition";
			if (captured.size > 0) return "pointer_gesture";
			if (
				Array.from(
					doc.querySelectorAll<HTMLElement>(
						'[role="dialog"], [role="alertdialog"], [role="menu"]',
					),
				).some((element) =>
					element.checkVisibility({
						visibilityProperty: true,
						opacityProperty: true,
					}),
				)
			)
				return "open_choice";
			if (
				doc.hasFocus() &&
				doc.activeElement?.closest(
					'input, textarea, [contenteditable="true"], .cm-editor',
				)
			)
				return "text_input";
			return null;
		},
		dispose: () => {
			doc.removeEventListener("compositionstart", compositionStart, true);
			doc.removeEventListener("compositionend", compositionEnd, true);
			doc.removeEventListener("gotpointercapture", captureGot, true);
			doc.removeEventListener("lostpointercapture", captureLost, true);
		},
	};
}

export function connectAgent(descriptor: string): Promise<boolean> {
	disconnectAgent();
	const match = /^(\d{1,5}):(\d{8})$/.exec(descriptor.trim());
	const port = Number(match?.[1]);
	if (!match || port < 1 || port > 65535) {
		useAgentConnection.setState({ error: copy.agent.invalidDescriptor });
		return Promise.resolve(false);
	}
	useAgentConnection.setState({
		status: "connecting",
		error: null,
		lastOutcome: null,
	});
	let socket: WebSocket;
	try {
		socket = new WebSocket(`ws://127.0.0.1:${port}/agent`);
	} catch {
		useAgentConnection.setState({
			status: "disconnected",
			error: copy.agent.connectionFailed,
		});
		return Promise.resolve(false);
	}
	const sessionId = crypto.randomUUID();
	let credential: string | null = null;
	let session: AgentSession | null = null;
	let closed = false;
	let finish: (connected: boolean) => void;
	const connected = new Promise<boolean>((resolve) => {
		finish = resolve;
	});
	const guards = watchInputGuards(document);
	const stop = (error: string | null = null) => {
		if (closed) return;
		closed = true;
		clearTimeout(timer);
		session?.close();
		activeSession = null;
		cleanup = null;
		socket.close();
		guards.dispose();
		window.removeEventListener("storage", storageChanged);
		window.removeEventListener("pagehide", pageHidden);
		useAgentConnection.setState({ status: "disconnected", error });
		finish(false);
	};
	const storageChanged = (event: StorageEvent) => {
		if (
			session &&
			(event.key === null ||
				event.key === LIBRARY_KEY ||
				event.key.startsWith("tabelo.table."))
		)
			stop(copy.agent.sessionEnded);
	};
	const pageHidden = () => stop();
	const timer = setTimeout(
		() => stop(copy.agent.connectionFailed),
		AGENT_LIMITS.pairingMs,
	);
	cleanup = () => stop();
	window.addEventListener("storage", storageChanged);
	window.addEventListener("pagehide", pageHidden);
	socket.onopen = () =>
		socket.send(
			JSON.stringify(
				pairingSchema.parse({
					version: WIRE_VERSION,
					kind: "pair",
					code: match[2],
					sessionId,
				}),
			),
		);
	socket.onerror = () => stop(copy.agent.connectionFailed);
	socket.onclose = () =>
		stop(credential ? copy.agent.sessionEnded : copy.agent.connectionFailed);
	socket.onmessage = (event) => {
		if (closed) return;
		if (
			typeof event.data !== "string" ||
			new TextEncoder().encode(event.data).byteLength > AGENT_LIMITS.bytes
		) {
			stop(copy.agent.invalidResponse);
			return;
		}
		let value: unknown;
		try {
			value = JSON.parse(event.data);
		} catch {
			stop(copy.agent.invalidResponse);
			return;
		}
		if (!credential) {
			const paired = pairedSchema.safeParse(value);
			if (!paired.success || paired.data.sessionId !== sessionId) {
				stop(copy.agent.invalidResponse);
				return;
			}
			credential = paired.data.credential;
			clearTimeout(timer);
			session = new AgentSession({
				id: sessionId,
				busy: guards.busy,
				onEnd: () => stop(copy.agent.sessionEnded),
				onChange: (paused) => {
					useAgentConnection.setState({
						status: paused ? "paused" : "connected",
					});
				},
			});
			activeSession = session;
			useAgentConnection.setState({ status: "connected", error: null });
			finish(true);
			return;
		}
		const parsed = requestSchema.safeParse(value);
		if (!parsed.success || parsed.data.credential !== credential || !session) {
			stop(copy.agent.invalidResponse);
			return;
		}
		const request = parsed.data;
		// An unexpected application exception is an uncertain result, never a
		// success-shaped fallback or an invitation to replay a mutation.
		try {
			const outcome = session.execute(
				request.call,
				request.sequence,
				request.deadline,
			);
			const response = {
				version: WIRE_VERSION,
				kind: "result",
				credential,
				callId: request.callId,
				result: outcome,
			};
			if (encodedBytes(response) > AGENT_LIMITS.bytes) {
				stop(copy.agent.invalidResponse);
				return;
			}
			socket.send(JSON.stringify(response));
			if (
				request.call.tool === "tabelo_edit_table" ||
				request.call.tool === "tabelo_edit_workspace" ||
				request.call.tool === "tabelo_manage_tables"
			) {
				useAgentConnection.setState({ lastOutcome: outcome.code });
				if (outcome.ok && outcome.data?.applied) {
					const table = request.call.tool === "tabelo_edit_table";
					useTabeloStore.getState().pushNotice({
						severity: "info",
						message: table
							? copy.agent.tableUpdated
							: request.call.tool === "tabelo_manage_tables"
								? copy.agent.libraryUpdated
								: copy.agent.workspaceUpdated,
						...(table ? { undoFor: useTabeloStore.getState().document } : {}),
					});
				} else if (outcome.code === "revision_conflict") {
					useTabeloStore
						.getState()
						.pushNotice({ severity: "info", message: copy.agent.conflict });
				}
			}
		} catch {
			stop(copy.agent.uncertain);
		}
	};
	return connected;
}
