import { type ReconciliationSource, reconcileDocument } from "@/core/document";
import type { TableDocument } from "@/core/types";
import type { ParseIssue, SourceTableRow } from "@/formats/types";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import type { Workspace } from "@/workspace/layout";

// The draft buffer: the text one source pane holds, what it parsed to, and the
// grace period before a syntax error is shown. The store composes this; it
// decides nothing about the document timeline (see history/timeline.ts).

export type DraftStatus = "clean" | "invalid-grace" | "invalid";

// The exact pane and format holding an editor buffer. A clean buffer has
// already committed its meaning to the document but stays here so
// synchronization never rewrites the user's formatting, cursor, or history.
export interface Draft {
	readonly paneId: string;
	readonly viewId: ViewId;
	readonly text: string;
	readonly status: DraftStatus;
	readonly issues: readonly ParseIssue[];
	readonly warnings: readonly ParseIssue[];
	// Where the parsed table's rows sit in `text`, for the source view's row
	// separators (#296). Empty unless the text parses, so an invalid draft never
	// shows structure it does not have. Derived from the parse, never persisted.
	readonly rows: readonly SourceTableRow[];
}

type DraftOwner = Pick<Draft, "paneId" | "viewId">;

// Syntax errors get a short grace period so a transient broken delimiter never
// flashes feedback while the user is still completing the transaction.
const INVALID_GRACE_MS = 300;

let invalidTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelInvalidGrace(): void {
	if (!invalidTimer) return;
	clearTimeout(invalidTimer);
	invalidTimer = null;
}

// What happens to the grace timer when text still does not parse. Typing on
// inside a running grace period keeps it running, typing on after the error is
// visible keeps it visible, and anything else starts a fresh period.
export type InvalidGrace = "keep" | "none" | "start";

// Starts the grace period for a draft `readDraft` answered with "start". The
// caller cancels any earlier period first, exactly when the answer is not
// "keep", so a continuing period is never restarted.
export function startInvalidGrace(expire: () => void): void {
	invalidTimer = setTimeout(() => {
		invalidTimer = null;
		expire();
	}, INVALID_GRACE_MS);
}

// The draft once its grace period ran out, or null when that period no longer
// describes it: the owner changed, or the text parsed in the meantime.
export function revealInvalid(
	draft: Draft | null,
	owner: DraftOwner,
): Draft | null {
	return draft?.paneId === owner.paneId &&
		draft.viewId === owner.viewId &&
		draft.status === "invalid-grace"
		? { ...draft, status: "invalid" }
		: null;
}

// What one change of a pane's text means, relative to the draft it replaces.
// `displacesInvalid` names another pane's uncommitted draft being superseded,
// which the timeline records as its own step so it stays recoverable.
export type DraftRead =
	| {
			readonly ok: false;
			readonly draft: Draft;
			readonly displacesInvalid: boolean;
			readonly grace: InvalidGrace;
	  }
	| {
			readonly ok: true;
			readonly draft: Draft;
			readonly displacesInvalid: boolean;
			// The parse reconciled against the current document, so every row and
			// column that survived keeps its identifier. The current document
			// itself when the text changed nothing.
			readonly document: TableDocument;
			readonly reconciliation: ReconciliationSource;
	  };

// Reads a pane's text. Null when the pane does not show that view, or the view
// has no codec to parse it with: there is then no draft to hold.
export function readDraft(
	previous: Draft | null,
	document: TableDocument,
	workspace: Workspace,
	owner: DraftOwner,
	text: string,
): DraftRead | null {
	const { paneId, viewId } = owner;
	const pane = workspace.panes.find(
		(candidate) => candidate.id === paneId && candidate.view === viewId,
	);
	if (!pane) return null;

	const codec = getView(viewId).codec;
	if (!codec) return null;

	const sameOwner = previous?.paneId === paneId && previous.viewId === viewId;
	const displacesInvalid =
		previous !== null && !sameOwner && previous.status !== "clean";
	const result = codec.parse(text);

	if (!result.ok) {
		const continuingVisibleError = sameOwner && previous.status === "invalid";
		const continuingGrace = sameOwner && previous.status === "invalid-grace";
		return {
			ok: false,
			draft: {
				paneId,
				viewId,
				text,
				status: continuingVisibleError ? "invalid" : "invalid-grace",
				issues: result.issues,
				warnings: [],
				rows: [],
			},
			displacesInvalid,
			grace: continuingGrace
				? "keep"
				: continuingVisibleError
					? "none"
					: "start",
		};
	}

	return {
		ok: true,
		draft: {
			paneId,
			viewId,
			text,
			status: "clean",
			issues: [],
			warnings: result.warnings ?? [],
			rows: result.rows ?? [],
		},
		displacesInvalid,
		document: reconcileDocument(
			document,
			result.document,
			codec.reconciliation,
		),
		reconciliation: codec.reconciliation,
	};
}

// A stored or restored draft read again against the current workspace. It is
// dropped when no pane shows its view any more, and its status is always
// recomputed from its text rather than trusted.
export function deriveDraft(
	draft: Pick<Draft, "paneId" | "viewId" | "text">,
	workspace: Workspace,
): Draft | null {
	const ownsDraft = workspace.panes.some(
		(pane) => pane.id === draft.paneId && pane.view === draft.viewId,
	);
	if (!ownsDraft) return null;

	const parse = getView(draft.viewId).codec?.parse;
	if (!parse) return null;
	const result = parse(draft.text);
	return result.ok
		? {
				...draft,
				status: "clean",
				issues: [],
				warnings: result.warnings ?? [],
				rows: result.rows ?? [],
			}
		: {
				...draft,
				status: "invalid",
				issues: result.issues,
				warnings: [],
				rows: [],
			};
}

export function restoreDraft(
	draft: Draft | null,
	workspace: Workspace,
): Draft | null {
	return draft ? deriveDraft(draft, workspace) : null;
}
