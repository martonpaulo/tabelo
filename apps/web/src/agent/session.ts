import {
	AGENT_LIMITS,
	type AgentCall,
	type AgentResult,
	callSchema,
	encodedBytes,
	failure,
	fingerprint,
	type ReadRequest,
	ReceiptCache,
	result,
	type WorkspaceEdit,
} from "@tabelo/agent-protocol";
import { readCell } from "@/core/cell-value";
import { activeRange } from "@/core/selection";
import type { CellValue } from "@/core/types";
import { flushPersistence, useTabeloStore } from "@/state/store";
import { viewChoiceRefusal } from "@/views/availability";
import { listViews } from "@/views/registry";
import { layoutsForPaneCount, splitOptions } from "@/workspace/layout";
import { prepareTable, preserveSelection } from "./table-commands";

type Receipt = { fingerprint: string; result: AgentResult };

export class AgentSession {
	readonly id: string;
	readonly tableId = useTabeloStore.getState().library.activeId;
	private documentRevision = 0;
	private workspaceRevision = 0;
	private highWater = 0;
	private ended = false;
	private receipts = new ReceiptCache<Receipt>();
	private unsubscribe: () => void;
	private paused = false;
	private busy: () => string | null;
	private onChange: (paused: boolean) => void;

	constructor(options: {
		id: string;
		busy?: () => string | null;
		onEnd?: () => void;
		onChange?: (paused: boolean) => void;
	}) {
		this.id = options.id;
		this.busy = options.busy ?? (() => null);
		this.onChange = options.onChange ?? (() => {});
		this.unsubscribe = useTabeloStore.subscribe((state, previous) => {
			if (
				state.library.activeId !== this.tableId ||
				state.documentEpoch !== previous.documentEpoch
			) {
				this.close();
				options.onEnd?.();
				return;
			}
			if (state.document !== previous.document) this.documentRevision++;
			if (state.workspace !== previous.workspace) this.workspaceRevision++;
			if (state.historyNavigation !== previous.historyNavigation)
				this.pause(true);
		});
	}

	pause(paused: boolean): void {
		if (this.ended) return;
		this.paused = paused;
		this.onChange(paused);
	}

	close(): void {
		this.ended = true;
		this.unsubscribe();
		this.receipts.clear();
	}

	private revisions(): Record<string, unknown> {
		return {
			documentRevision: this.documentRevision,
			workspaceRevision: this.workspaceRevision,
		};
	}

	private busyReason(): string | null {
		const state = useTabeloStore.getState();
		if (state.editing || state.editingHeader !== null) return "cell_edit";
		if (state.draft && state.draft.status !== "clean")
			return "unfinished_source";
		if (state.pendingImport || state.pendingPaneAction) return "pending_choice";
		if (state.storageIssue?.kind === "unreadable") return "unreadable_storage";
		return this.busy();
	}

	execute(input: unknown, sequence: number, deadline: number): AgentResult {
		const parsed = callSchema.safeParse(input);
		if (!parsed.success || encodedBytes(input) > AGENT_LIMITS.bytes - 1024)
			return failure("invalid_request");
		const call = parsed.data;
		if (this.ended || call.args.sessionId !== this.id)
			return failure("session_changed");
		if (call.tool === "tabelo_operation_status")
			return (
				this.receipts.get(call.args.requestId)?.result ??
				failure("outcome_unknown")
			);
		if (call.tool === "tabelo_read") return this.read(call.args);
		const prior = this.receipts.get(call.args.requestId);
		const signature = fingerprint(call);
		if (prior)
			return prior.fingerprint === signature
				? prior.result
				: failure("request_id_reused");
		if (!Number.isSafeInteger(sequence) || sequence <= this.highWater)
			return failure("receipt_expired");
		this.highWater = sequence;
		const outcome =
			Date.now() > deadline ? failure("request_expired") : this.mutate(call);
		this.receipts.set(call.args.requestId, {
			fingerprint: signature,
			result: outcome,
		});
		return outcome;
	}

	private read(args: ReadRequest): AgentResult {
		if (
			args.expectedDocumentRevision !== undefined &&
			args.expectedDocumentRevision !== this.documentRevision
		)
			return failure("revision_conflict", this.revisions());
		const state = useTabeloStore.getState();
		const offset = args.rowOffset ?? 0;
		if (
			offset > state.document.rows.length ||
			(offset > 0 && args.expectedDocumentRevision === undefined)
		)
			return failure("invalid_page");
		const focus = activeRange(state.selection).focus;
		const columnIds =
			args.columnIds ?? state.document.columns.map((column) => column.id);
		if (new Set(columnIds).size !== columnIds.length)
			return failure("duplicate_column");
		const columns = columnIds.map((id) =>
			state.document.columns.find((column) => column.id === id),
		);
		if (columns.some((column) => column === undefined))
			return failure("target_missing");
		const selectedColumns = columns.filter((column) => column !== undefined);
		const data = {
			sessionId: this.id,
			tableId: this.tableId,
			name: state.name,
			...this.revisions(),
			paused: this.paused,
			busy: this.busyReason(),
			storage: state.storageIssue?.kind ?? "available",
			columns: selectedColumns,
			rows: [] as { id: string; values: CellValue[] }[],
			totalRows: state.document.rows.length,
			nextRowOffset: null as number | null,
			selection: {
				rowId: state.document.rows[focus.row]?.id ?? null,
				columnId: state.document.columns[focus.column]?.id ?? null,
				header: focus.row < 0,
			},
			...(args.includeWorkspace
				? {
						workspace: state.workspace,
						views: listViews().map((view) => ({
							id: view.id,
							label: view.label,
							kind: view.kind,
							capabilities: view.capabilities,
							available:
								viewChoiceRefusal({
									view,
									panes: state.workspace.panes,
									document: state.document,
								}) === null,
						})),
						layouts: layoutsForPaneCount(state.workspace.panes.length),
						splits: splitOptions(state.workspace),
					}
				: {}),
		};
		const max = AGENT_LIMITS.bytes - 1024;
		// Count each row once. Reserve the continuation index before filling the
		// page so a multibyte value never makes the final envelope oversized.
		let bytes = encodedBytes(data) + String(data.totalRows).length;
		if (bytes > max) return failure("value_too_large");
		for (const row of state.document.rows.slice(
			offset,
			offset + (args.rowLimit ?? 50),
		)) {
			const entry = {
				id: row.id,
				values: selectedColumns.map((column) => readCell(row, column.id)),
			};
			const rowBytes = encodedBytes(entry) + (data.rows.length > 0 ? 1 : 0);
			if (bytes + rowBytes > max) break;
			bytes += rowBytes;
			data.rows.push(entry);
		}
		if (data.rows.length === 0 && offset < state.document.rows.length)
			return failure("value_too_large");
		const next = offset + data.rows.length;
		data.nextRowOffset = next < state.document.rows.length ? next : null;
		return result("read", data);
	}

	private mutate(
		call: Extract<
			AgentCall,
			{ tool: "tabelo_edit_table" | "tabelo_edit_workspace" }
		>,
	): AgentResult {
		if (call.args.tableId !== this.tableId) return failure("session_changed");
		if (this.paused) return failure("session_paused");
		const busy = this.busyReason();
		if (busy) return failure("user_busy", { reason: busy });
		if (
			call.args.expectedDocumentRevision !== this.documentRevision ||
			(call.tool === "tabelo_edit_workspace" &&
				call.args.expectedWorkspaceRevision !== this.workspaceRevision)
		)
			return failure("revision_conflict", this.revisions());
		const state = useTabeloStore.getState();
		let changed = false;
		let created: Record<string, string> = {};
		if (call.tool === "tabelo_edit_table") {
			const prepared = prepareTable(state.document, call.args.operations);
			if (!prepared.ok) return failure(prepared.code);
			changed = prepared.document !== state.document;
			created = prepared.created;
			if (changed)
				state.applyDocument(prepared.document, {
					before: state.selection,
					after: preserveSelection(
						state.selection,
						state.document,
						prepared.document,
					),
				});
		} else {
			const outcome = this.workspace(call.args);
			if (!outcome.ok) return outcome;
			changed = state.workspace !== useTabeloStore.getState().workspace;
		}
		const persistence = changed ? flushPersistence().status : "unchanged";
		return result(changed ? "applied" : "no_change", {
			applied: changed,
			...this.revisions(),
			created,
			persistence,
		});
	}

	private workspace(args: WorkspaceEdit): AgentResult {
		const state = useTabeloStore.getState();
		const action = args.action;
		const workspace = state.workspace;
		if (
			"paneId" in action &&
			!workspace.panes.some((pane) => pane.id === action.paneId)
		)
			return failure("target_missing");
		if (action.kind === "add_view" || action.kind === "change_view") {
			const view = listViews().find((view) => view.id === action.viewId);
			if (!view) return failure("unknown_view");
			const refusal = viewChoiceRefusal({
				view,
				panes: workspace.panes,
				document: state.document,
				currentPaneId:
					action.kind === "change_view" ? action.paneId : undefined,
				currentViewId:
					action.kind === "change_view"
						? workspace.panes.find((pane) => pane.id === action.paneId)?.view
						: undefined,
			});
			if (refusal) return failure(refusal.code);
			if (action.kind === "add_view") {
				const option = splitOptions(workspace).find(
					(option) =>
						option.paneId === action.paneId &&
						option.layout === action.layoutId,
				);
				if (!option) return failure("invalid_layout");
				state.addPaneBySplit(option, view.id);
			} else state.setPaneView(action.paneId, view.id);
			// The UI versions activate their target; a background command must not
			// take focus from a surviving pane. React observes the final state.
			useTabeloStore.getState().setActivePane(workspace.activePaneId);
		} else if (action.kind === "close_view") {
			if (workspace.panes.length === 1) return failure("last_pane");
			state.closePane(action.paneId);
		} else if (action.kind === "move_view") {
			if (!workspace.panes.some((pane) => pane.id === action.destinationPaneId))
				return failure("target_missing");
			state.movePane(action.paneId, action.destinationPaneId);
		} else {
			if (workspace.layout === action.layoutId) return result("workspace");
			const layout = layoutsForPaneCount(workspace.panes.length).find(
				(layout) => layout.id === action.layoutId,
			);
			if (!layout) return failure("invalid_layout");
			state.setLayout(layout.id);
		}
		return result("workspace");
	}
}
