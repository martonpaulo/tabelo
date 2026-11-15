import { create } from "zustand";

// What the first screen needs of the agent connection: its status, for the app
// menu, and a way to end it, for the page going away. The connection itself,
// its session and the wire contract load with the dialog that starts one
// (#559), so a first visit does not download them before it can draw.

// Why the last connection attempt or session ended, as a reason rather than
// copy (#451): only a malformed code is a fact about what the user typed, and
// the dialog decides from the reason which of its parts reports it.
export type AgentConnectionError =
	| "invalid-descriptor"
	| "connection-failed"
	| "invalid-response"
	| "session-ended"
	| "uncertain";

type ConnectionState = {
	status: "disconnected" | "connecting" | "connected" | "paused";
	error: AgentConnectionError | null;
	lastOutcome: string | null;
};
export const useAgentConnection = create<ConnectionState>(() => ({
	status: "disconnected",
	error: null,
	lastOutcome: null,
}));

// The connection under way, if one is: how to end it, and, once paired, how to
// pause its session.
export interface ActiveConnection {
	readonly stop: () => void;
	pause: ((paused: boolean) => void) | null;
}

let active: ActiveConnection | null = null;

export function setActiveConnection(next: ActiveConnection | null): void {
	active = next;
}

export function disconnectAgent(): void {
	active?.stop();
}

export function pauseAgent(paused: boolean): void {
	active?.pause?.(paused);
}
