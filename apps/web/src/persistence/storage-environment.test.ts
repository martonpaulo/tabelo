// @vitest-environment happy-dom

import { expect, it } from "vitest";

// Guards the Vitest worker flag for #528: on Node 25 and later the runtime's
// own Web Storage global shadowed happy-dom's and left it undefined, which
// failed every storage test on a machine newer than CI.
it("gives happy-dom tests a working localStorage", () => {
	window.localStorage.setItem("probe", "value");
	expect(window.localStorage.getItem("probe")).toBe("value");
	window.localStorage.clear();
	expect(window.localStorage.length).toBe(0);
});
