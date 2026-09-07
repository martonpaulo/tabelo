import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

// Axe is a regression net over the rendered accessibility tree and the computed
// styles, and nothing more. It reaches roughly a third of real accessibility
// defects, so a clean run proves that no ordinary WCAG violation regressed, not
// that a state is accessible. The behavioural tests it sits beside stay
// load-bearing: keyboard flow, focus placement, live-region announcements, and
// the Chromium-computed accessible descriptions asserted in
// disabled-reason.spec.ts, which axe cannot see (#283).
//
// The tag set is the WCAG 2.1 A and AA rule sets and nothing else, so the
// baseline is a published standard rather than axe's best-practice opinion.
// https://playwright.dev/docs/accessibility-testing
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface AxeNode {
	readonly target: readonly unknown[];
	readonly failureSummary?: string;
}

interface AxeViolation {
	readonly id: string;
	readonly impact?: string | null;
	readonly help: string;
	readonly helpUrl: string;
	readonly nodes: readonly AxeNode[];
}

// The assertion compares a list of strings rather than the raw violation
// objects: Playwright prints the diff, and a rule id with its impact, its
// documentation link, and the exact node that failed is what makes a red run
// actionable without opening the attachment.
function describe(violation: AxeViolation): string[] {
	const impact = violation.impact ?? "unknown";
	return violation.nodes.map((node) => {
		const target = node.target.map((part) => String(part)).join(" ");
		const summary = node.failureSummary?.replace(/\s+/g, " ").trim();
		return [
			`${violation.id} (${impact}) at ${target}`,
			summary ?? violation.help,
			violation.helpUrl,
		].join(" | ");
	});
}

// One scan of the whole page, including anything portalled outside the app
// root, after the caller has already waited for the state to settle.
export async function expectNoAxeViolations(
	page: Page,
	testInfo: TestInfo,
	state: string,
): Promise<void> {
	const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
	const violations = results.violations as readonly AxeViolation[];

	if (violations.length > 0) {
		await testInfo.attach(`axe-${state}`, {
			body: JSON.stringify(violations, null, 2),
			contentType: "application/json",
		});
	}

	expect(violations.flatMap(describe), `axe violations in ${state}`).toEqual(
		[],
	);
}
