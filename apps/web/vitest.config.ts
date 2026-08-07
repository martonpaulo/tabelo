import { defineConfig } from "vitest/config";

// The suite covers the pure layers: document, operations, parsers,
// serializers, which need no DOM. Browser-level behaviour is verified by
// driving the real app, not by simulating one here.
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "node",
		// The root pattern covers the tooling modules beside this file, which
		// configure the dev server and the browser suite rather than ship in the
		// bundle. They read the environment and reject bad input, so they are
		// worth the same coverage as the pure layers under `src`.
		include: ["src/**/*.test.ts", "*.test.ts"],
	},
});
