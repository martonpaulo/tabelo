import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devServerPort } from "./worktree-ports.ts";

// The Claude Code browser preview needs a literal port number and JSON cannot
// derive one, so this file is generated per worktree from the same module the
// dev server reads. That keeps one owner for the port instead of two copies
// drifting apart, which is what previously pointed an agent's preview at
// another worktree's app. Plain JavaScript so Node can run it directly during
// postinstall, before any build step exists.
//
// This is deliberately not tracked: every worktree derives a different port.

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(appDirectory, "..", "..");
const configDirectory = join(repositoryRoot, ".claude");

const config = {
	version: "0.0.1",
	configurations: [
		{
			name: "tabelo-web",
			runtimeExecutable: "pnpm",
			runtimeArgs: ["dev:web"],
			port: devServerPort,
		},
	],
};

mkdirSync(configDirectory, { recursive: true });
writeFileSync(
	join(configDirectory, "launch.json"),
	`${JSON.stringify(config, null, "\t")}\n`,
);
