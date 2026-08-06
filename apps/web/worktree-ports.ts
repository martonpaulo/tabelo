import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Several worktrees of this repository are developed in parallel on one machine,
// each with its own dev server and its own browser suite. Fixed ports make the
// second worktree either fail to start or, worse, silently serve and test the
// first worktree's build, which reports a green suite for code that was never
// exercised. Deriving both ports from the worktree path gives every checkout its
// own pair with no per-machine setup and no cross-process coordination.
//
// CI runs one checkout per job in its own container, so it keeps the canonical
// ports and stays byte-identical to what it did before.

const DEV_PORT_BASE = 3001;
const PREVIEW_PORT_BASE = 4173;

// Wide enough that two checkouts landing on the same offset is a curiosity
// rather than a habit, narrow enough that the two ranges stay clear of each
// other and well below the ephemeral port range.
const PORT_SPAN = 64;

const worktreePath = dirname(fileURLToPath(import.meta.url));

function worktreeOffset(): number {
	if (process.env.CI) return 0;
	const digest = createHash("sha256").update(worktreePath).digest();
	return digest.readUInt16BE(0) % PORT_SPAN;
}

function readPortOverride(name: string): number | null {
	const raw = process.env[name];
	if (raw === undefined || raw === "") return null;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1024 || port > 65535) {
		throw new Error(
			`${name} must be an integer between 1024 and 65535, received "${raw}".`,
		);
	}
	return port;
}

const offset = worktreeOffset();

export const devServerPort =
	readPortOverride("TABELO_DEV_PORT") ?? DEV_PORT_BASE + offset;

export const previewServerPort =
	readPortOverride("TABELO_PREVIEW_PORT") ?? PREVIEW_PORT_BASE + offset;
