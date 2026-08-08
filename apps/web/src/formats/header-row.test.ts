// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { getCodec } from "@/formats";

describe("format-declared header rows", () => {
	it.each([
		["markdown", "| Name | Role |\n| --- | --- |\n| Ingrid | Designer |", true],
		["jira", "||Name||Role||\n|Ingrid|Designer|", true],
		[
			"html",
			"<table><tr><th>Name</th><th>Role</th></tr><tr><td>Ingrid</td><td>Designer</td></tr></table>",
			true,
		],
		["html", "<table><tr><td>Ingrid</td><td>Designer</td></tr></table>", false],
		["html", "<table><tr><th>Ingrid</th><td>Designer</td></tr></table>", false],
		["json", '[{"Name":"Ingrid","Role":"Designer"}]', true],
		["records", "Name: Ingrid\n- Role: Designer", true],
		["csv", "Name,Role\nIngrid,Designer", undefined],
		["tsv", "Name\tRole\nIngrid\tDesigner", undefined],
	] as const)("reports the %s header fact", (format, text, headerRow) => {
		const result = getCodec(format).parseMatrix(text);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.table.headerRow).toBe(headerRow);
	});

	it("keeps source-pane delimited parsing deterministic", () => {
		const result = getCodec("csv").parse("Name,Role\nIngrid,Designer");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.document.columns.map((column) => column.header)).toEqual([
			"Name",
			"Role",
		]);
	});
});
