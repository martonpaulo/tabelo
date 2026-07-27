import { defineConfig } from "vitest/config";

// The suite covers the pure layers — document, operations, parsers,
// serializers — which need no DOM. Browser-level behaviour is verified by
// driving the real app, not by simulating one here.
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
