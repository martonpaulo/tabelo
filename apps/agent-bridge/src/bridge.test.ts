import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import {
	AGENT_LIMITS,
	ReceiptCache,
	requestSchema,
	WIRE_VERSION,
} from "@tabelo/agent-protocol";
import { WebSocket } from "ws";
import { LocalBridge } from "./bridge.ts";

test("a local connection requires the allowed origin and a one-use pairing code", async () => {
	const bridge = new LocalBridge();
	try {
		const pairing = await bridge.connect();
		assert.equal(pairing.code, "pairing");
		const descriptor = String(pairing.data?.descriptor);
		const [port, code] = descriptor.split(":");
		const denied = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
			origin: "https://untrusted.example",
		});
		const [error] = await once(denied, "error");
		assert.match(String(error), /403/);
		const peer = new WebSocket(`ws://127.0.0.1:${port}/agent`, {
			origin: "https://tabelo.martonpaulo.com",
		});
		await once(peer, "open");
		peer.send(
			JSON.stringify({
				version: WIRE_VERSION,
				kind: "pair",
				code,
				sessionId: randomUUID(),
			}),
		);
		const [message] = await once(peer, "message");
		const welcome = JSON.parse(String(message));
		assert.equal(welcome.kind, "paired");
		assert.equal((await bridge.connect()).data?.sessionId, welcome.sessionId);
		peer.close();
		await once(peer, "close");
	} finally {
		await bridge.close();
	}
});

const origin = "https://tabelo.martonpaulo.com";

async function pair(bridge: LocalBridge) {
	const pairing = await bridge.connect();
	const [port, code] = String(pairing.data?.descriptor).split(":");
	const peer = new WebSocket(`ws://127.0.0.1:${port}/agent`, { origin });
	await once(peer, "open");
	peer.send(
		JSON.stringify({
			version: WIRE_VERSION,
			kind: "pair",
			code,
			sessionId: randomUUID(),
		}),
	);
	const [message] = await once(peer, "message");
	const welcome = JSON.parse(String(message)) as {
		credential: string;
		sessionId: string;
	};
	return { peer, welcome, port };
}

test("missing origin, null origin, and an incorrect Host cannot upgrade", async () => {
	const bridge = new LocalBridge();
	try {
		const pairing = await bridge.connect();
		const port = String(pairing.data?.descriptor).split(":")[0];
		for (const headers of [
			{},
			{ Origin: "null" },
			{ Origin: origin, Host: "untrusted.example" },
		]) {
			const peer = new WebSocket(`ws://127.0.0.1:${port}/agent`, { headers });
			const [error] = await once(peer, "error");
			assert.match(String(error), /403/);
		}
	} finally {
		await bridge.close();
	}
});

test("five invalid pairing attempts consume the pending authorization", async () => {
	const bridge = new LocalBridge();
	try {
		const pairing = await bridge.connect();
		const port = String(pairing.data?.descriptor).split(":")[0];
		for (let attempt = 0; attempt < AGENT_LIMITS.pairingAttempts; attempt++) {
			const peer = new WebSocket(`ws://127.0.0.1:${port}/agent`, { origin });
			await once(peer, "open");
			peer.send(
				JSON.stringify({
					version: WIRE_VERSION,
					kind: "pair",
					code: "00000000",
					sessionId: randomUUID(),
				}),
			);
			await once(peer, "close");
		}
		const renewed = await bridge.connect();
		assert.notEqual(renewed.data?.descriptor, pairing.data?.descriptor);
		assert.equal(renewed.code, "pairing");
	} finally {
		await bridge.close();
	}
});

test("an expired code is refused and a second tab cannot replace the paired one", async () => {
	let now = Date.now();
	const bridge = new LocalBridge({ now: () => now });
	try {
		const expired = await bridge.connect();
		now += AGENT_LIMITS.pairingMs + 1;
		const peer = new WebSocket(
			`ws://127.0.0.1:${String(expired.data?.descriptor).split(":")[0]}/agent`,
			{ origin },
		);
		assert.match(String((await once(peer, "error"))[0]), /409/);
		const connected = await pair(bridge);
		const other = new WebSocket(`ws://127.0.0.1:${connected.port}/agent`, {
			origin,
		});
		assert.match(String((await once(other, "error"))[0]), /409/);
		assert.equal(
			(await bridge.connect()).data?.sessionId,
			connected.welcome.sessionId,
		);
	} finally {
		await bridge.close();
	}
});

test("lost responses preserve request identity and acknowledged retries do not dispatch again", async () => {
	const bridge = new LocalBridge({ requestMs: 40 });
	try {
		const { peer, welcome } = await pair(bridge);
		const sequences: number[] = [];
		peer.on("message", (bytes) => {
			const request = requestSchema.parse(JSON.parse(bytes.toString()));
			sequences.push(request.sequence);
			if (sequences.length === 1) return;
			peer.send(
				JSON.stringify({
					version: WIRE_VERSION,
					kind: "result",
					credential: welcome.credential,
					callId: request.callId,
					result: { ok: true, code: "applied", data: { applied: true } },
				}),
			);
		});
		const input = {
			tool: "tabelo_edit_table",
			args: {
				sessionId: welcome.sessionId,
				tableId: "table",
				requestId: "edit",
				expectedDocumentRevision: 0,
				operations: [{ kind: "set_header", columnId: "column", value: "Name" }],
			},
		};
		assert.equal((await bridge.call(input)).code, "outcome_unknown");
		assert.equal((await bridge.call(input)).code, "applied");
		assert.equal((await bridge.call(input)).code, "applied");
		assert.equal(sequences.length, 2);
		assert.equal(sequences[0], sequences[1]);
		assert.equal(
			(
				await bridge.call({
					...input,
					args: { ...input.args, expectedDocumentRevision: 1 },
				})
			).code,
			"request_id_reused",
		);
	} finally {
		await bridge.close();
	}
});

test("malformed, oversized, incompatible, and forged messages end the connection", async () => {
	for (const message of [
		"{",
		JSON.stringify({ payload: "x".repeat(AGENT_LIMITS.bytes) }),
		JSON.stringify({ version: WIRE_VERSION + 1, kind: "result" }),
		JSON.stringify({
			version: WIRE_VERSION,
			kind: "result",
			credential: "forged",
			callId: "call",
			result: { ok: true, code: "applied" },
		}),
	]) {
		const bridge = new LocalBridge();
		try {
			const { peer, welcome } = await pair(bridge);
			peer.send(message);
			await once(peer, "close");
			assert.equal(
				(
					await bridge.call({
						tool: "tabelo_read",
						args: { sessionId: welcome.sessionId },
					})
				).code,
				"not_connected",
			);
		} finally {
			await bridge.close();
		}
	}
});

test("receipt storage evicts old large payloads without forgetting the newest outcome", () => {
	const receipts = new ReceiptCache<{ payload: string }>();
	for (let index = 0; index < 6; index++)
		receipts.set(`request-${index}`, { payload: "x".repeat(900_000) });
	assert.equal(receipts.get("request-0"), undefined);
	assert.equal(receipts.get("request-5")?.payload.length, 900_000);
	receipts.set("request-5", { payload: "applied" });
	assert.equal(receipts.get("request-5")?.payload, "applied");
	receipts.clear();
	assert.equal(receipts.get("request-5"), undefined);
});

test("a concurrent mutation is refused while the first result is outstanding", async () => {
	const bridge = new LocalBridge();
	try {
		const { peer, welcome } = await pair(bridge);
		const incoming = once(peer, "message");
		const input = {
			tool: "tabelo_manage_tables",
			args: {
				sessionId: welcome.sessionId,
				tableId: "table",
				requestId: "create",
				expectedDocumentRevision: 0,
				expectedLibraryRevision: 0,
				action: { kind: "create", name: "Research" },
			},
		};
		const first = bridge.call(input);
		const [bytes] = await incoming;
		const request = requestSchema.parse(JSON.parse(String(bytes)));
		assert.equal(
			(
				await bridge.call({
					...input,
					args: { ...input.args, requestId: "second" },
				})
			).code,
			"request_in_flight",
		);
		peer.send(
			JSON.stringify({
				version: WIRE_VERSION,
				kind: "result",
				credential: welcome.credential,
				callId: request.callId,
				result: { ok: true, code: "applied", data: { applied: true } },
			}),
		);
		assert.equal((await first).code, "applied");
		assert.equal((await bridge.call(input)).code, "applied");
	} finally {
		await bridge.close();
	}
});
