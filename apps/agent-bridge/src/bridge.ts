import {
	randomBytes,
	randomInt,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import { createServer, type Server } from "node:http";
import {
	AGENT_LIMITS,
	type AgentCall,
	type AgentResult,
	callSchema,
	encodedBytes,
	failure,
	fingerprint,
	pairingSchema,
	ReceiptCache,
	responseSchema,
	result,
	WIRE_VERSION,
} from "@tabelo/agent-protocol";
import { WebSocket, WebSocketServer } from "ws";

type Pending = {
	finish: (value: AgentResult) => void;
	timer: ReturnType<typeof setTimeout>;
};
type Receipt = { fingerprint: string; sequence: number; result?: AgentResult };

function sameSecret(left: string, right: string): boolean {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}

export class LocalBridge {
	private server: Server | null = null;
	private sockets: WebSocketServer | null = null;
	private peer: WebSocket | null = null;
	private credential = "";
	private sessionId = "";
	private pairingCode = "";
	private pairingUntil = 0;
	private attempts = 0;
	private port = 0;
	private sequence = 0;
	private inFlight = false;
	private pairingTimer: ReturnType<typeof setTimeout> | undefined;
	private starting: Promise<AgentResult> | null = null;
	private pending = new Map<string, Pending>();
	private receipts = new ReceiptCache<Receipt>();
	private readonly origins: ReadonlySet<string>;
	private readonly now: () => number;
	private readonly requestMs: number;

	constructor(
		options: {
			origins?: readonly string[];
			now?: () => number;
			requestMs?: number;
		} = {},
	) {
		this.origins = new Set(
			options.origins ?? ["https://tabelo.martonpaulo.com"],
		);
		this.now = options.now ?? Date.now;
		this.requestMs = options.requestMs ?? AGENT_LIMITS.requestMs;
	}

	async connect(): Promise<AgentResult> {
		if (this.peer?.readyState === WebSocket.OPEN)
			return result("connected", { sessionId: this.sessionId });
		if (this.starting) return this.starting;
		if (this.server && this.now() < this.pairingUntil && this.pairingCode)
			return this.pairingResult();
		this.starting = this.startPairing();
		try {
			return await this.starting;
		} finally {
			this.starting = null;
		}
	}

	private pairingResult(): AgentResult {
		return result("pairing", {
			descriptor: `${this.port}:${this.pairingCode}`,
			expiresAt: this.pairingUntil,
		});
	}

	private async startPairing(): Promise<AgentResult> {
		await this.close();
		this.pairingCode = String(randomInt(10_000_000, 100_000_000));
		this.pairingUntil = this.now() + AGENT_LIMITS.pairingMs;
		this.attempts = 0;
		const server = createServer((_request, response) => {
			response.writeHead(404);
			response.end();
		});
		const sockets = new WebSocketServer({
			noServer: true,
			maxPayload: AGENT_LIMITS.bytes,
			perMessageDeflate: false,
		});
		this.server = server;
		this.sockets = sockets;
		server.on("upgrade", (request, socket, head) => {
			if (
				request.url !== "/agent" ||
				request.headers.host !== `127.0.0.1:${this.port}` ||
				!request.headers.origin ||
				!this.origins.has(request.headers.origin)
			) {
				socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
				return;
			}
			if (
				this.peer ||
				sockets.clients.size >= AGENT_LIMITS.connections ||
				this.now() >= this.pairingUntil ||
				!this.pairingCode
			) {
				socket.end("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n");
				return;
			}
			sockets.handleUpgrade(request, socket, head, (peer) => this.accept(peer));
		});
		try {
			await new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen(0, "127.0.0.1", () => {
					server.off("error", reject);
					resolve();
				});
			});
		} catch {
			await this.close();
			return failure("listener_unavailable");
		}
		const address = server.address();
		if (!address || typeof address === "string") {
			await this.close();
			return failure("listener_unavailable");
		}
		this.port = address.port;
		this.pairingTimer = setTimeout(() => {
			void this.close();
		}, AGENT_LIMITS.pairingMs);
		this.pairingTimer.unref();
		return this.pairingResult();
	}

	private accept(peer: WebSocket): void {
		const authenticationTimer = setTimeout(
			() => peer.close(1008, "pairing_timeout"),
			AGENT_LIMITS.requestMs,
		);
		authenticationTimer.unref();
		peer.on("error", () => peer.terminate());
		peer.on("close", () => {
			clearTimeout(authenticationTimer);
			if (peer === this.peer) void this.close();
		});
		peer.on("message", (bytes, binary) => {
			let value: unknown;
			const buffer = Array.isArray(bytes)
				? Buffer.concat(bytes)
				: bytes instanceof ArrayBuffer
					? Buffer.from(bytes)
					: bytes;
			if (binary || (peer !== this.peer && buffer.byteLength > 512)) {
				peer.close(1008, "invalid_message");
				return;
			}
			try {
				value = JSON.parse(buffer.toString());
			} catch {
				peer.close(1008, "invalid_message");
				return;
			}
			if (peer !== this.peer) {
				const parsed = pairingSchema.safeParse(value);
				if (
					this.peer ||
					!parsed.success ||
					this.now() >= this.pairingUntil ||
					!sameSecret(parsed.data.code, this.pairingCode)
				) {
					peer.close(1008, "pairing_failed");
					this.attempts++;
					if (this.attempts >= AGENT_LIMITS.pairingAttempts) void this.close();
					return;
				}
				clearTimeout(authenticationTimer);
				clearTimeout(this.pairingTimer);
				this.pairingCode = "";
				this.peer = peer;
				this.sessionId = parsed.data.sessionId;
				this.credential = randomBytes(32).toString("hex");
				peer.send(
					JSON.stringify({
						version: WIRE_VERSION,
						kind: "paired",
						sessionId: this.sessionId,
						credential: this.credential,
					}),
				);
				return;
			}
			const parsed = responseSchema.safeParse(value);
			if (
				!parsed.success ||
				!sameSecret(parsed.data.credential, this.credential)
			) {
				peer.close(1008, "invalid_message");
				return;
			}
			const pending = this.pending.get(parsed.data.callId);
			if (!pending) return;
			clearTimeout(pending.timer);
			this.pending.delete(parsed.data.callId);
			pending.finish(parsed.data.result);
		});
	}

	async call(input: unknown): Promise<AgentResult> {
		const parsed = callSchema.safeParse(input);
		if (!parsed.success) return failure("invalid_request");
		const call = parsed.data;
		if (this.pending.size >= AGENT_LIMITS.connections)
			return failure("request_in_flight");
		if (!this.peer || this.peer.readyState !== WebSocket.OPEN)
			return failure("not_connected");
		if (call.args.sessionId !== this.sessionId)
			return failure("session_changed");
		if (encodedBytes(call) > AGENT_LIMITS.bytes - 1024)
			return failure("payload_too_large");
		const mutation =
			call.tool === "tabelo_edit_table" ||
			call.tool === "tabelo_edit_workspace";
		let receipt: Receipt | undefined;
		if (mutation) {
			receipt = this.receipts.get(call.args.requestId);
			if (receipt && receipt.fingerprint !== fingerprint(call))
				return failure("request_id_reused");
			if (receipt?.result) return receipt.result;
			if (this.inFlight) return failure("request_in_flight");
			if (!receipt) {
				receipt = { fingerprint: fingerprint(call), sequence: ++this.sequence };
				this.receipts.set(call.args.requestId, receipt);
			}
			this.inFlight = true;
		}
		try {
			const outcome = await this.dispatch(
				call,
				receipt?.sequence ?? ++this.sequence,
			);
			if (
				receipt &&
				outcome.code !== "outcome_unknown" &&
				"requestId" in call.args
			) {
				receipt.result = outcome;
				this.receipts.set(call.args.requestId, receipt);
			}
			return outcome;
		} finally {
			if (mutation) this.inFlight = false;
		}
	}

	private dispatch(call: AgentCall, sequence: number): Promise<AgentResult> {
		const peer = this.peer;
		if (!peer || peer.readyState !== WebSocket.OPEN)
			return Promise.resolve(failure("not_connected"));
		const callId = randomUUID();
		return new Promise((finish) => {
			const timer = setTimeout(() => {
				this.pending.delete(callId);
				finish(failure("outcome_unknown"));
			}, this.requestMs);
			this.pending.set(callId, { finish, timer });
			peer.send(
				JSON.stringify({
					version: WIRE_VERSION,
					kind: "request",
					credential: this.credential,
					callId,
					sequence,
					deadline: this.now() + this.requestMs,
					call,
				}),
				(error) => {
					if (!error) return;
					const pending = this.pending.get(callId);
					if (!pending) return;
					clearTimeout(timer);
					this.pending.delete(callId);
					finish(failure("outcome_unknown"));
				},
			);
		});
	}

	async close(): Promise<void> {
		clearTimeout(this.pairingTimer);
		const server = this.server;
		const sockets = this.sockets;
		this.server = null;
		this.sockets = null;
		this.peer = null;
		this.credential = "";
		this.sessionId = "";
		this.pairingCode = "";
		this.receipts.clear();
		this.sequence = 0;
		this.inFlight = false;
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.finish(failure("outcome_unknown"));
		}
		this.pending.clear();
		for (const peer of sockets?.clients ?? []) peer.terminate();
		sockets?.close();
		if (server?.listening)
			await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}
