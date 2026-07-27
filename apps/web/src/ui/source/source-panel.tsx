import { ClipboardCopy, Download } from "lucide-react";
import { useMemo } from "react";
import { formatOrder, getFormat } from "@/formats";
import type { TextFormat } from "@/formats/types";
import { downloadText, writeClipboardText } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { FormatSwitch } from "@/ui/primitives/format-switch";
import { Panel } from "@/ui/primitives/panel";
import { StatusPill, type StatusTone } from "@/ui/primitives/status-pill";
import { ToolbarButton } from "@/ui/primitives/toolbar-button";
import { SourceEditor } from "./source-editor";

// Everything the user needs to understand the source panel's state is in its
// header and footer: which format, whether it is in sync, and what is wrong.
// Nothing here moves when that state changes — see docs/design-system.md §5.

export function SourcePanel() {
	const textFormat = useTabeloStore((state) => state.textFormat);
	const draftText = useTabeloStore((state) => state.draftText);
	const draftDirty = useTabeloStore((state) => state.draftDirty);
	const issues = useTabeloStore((state) => state.issues);
	const warnings = useTabeloStore((state) => state.warnings);
	const document = useTabeloStore((state) => state.document);

	const format = getFormat(textFormat);

	const status: { tone: StatusTone; label: string; hint: string } =
		useMemo(() => {
			if (issues.length > 0) {
				return {
					tone: "invalid",
					label: copy.status.invalid,
					hint: copy.status.invalidHint,
				};
			}
			if (draftDirty) {
				return {
					tone: "pending",
					label: copy.status.typing,
					hint: copy.status.typingHint,
				};
			}
			return {
				tone: "ok",
				label: copy.status.synced,
				hint: copy.status.syncedHint,
			};
		}, [issues.length, draftDirty]);

	const invalidLine =
		issues.find((issue) => issue.line !== undefined)?.line ?? null;
	const messages = issues.length > 0 ? issues : warnings;

	return (
		<Panel className="min-w-0">
			<Panel.Header>
				<Panel.Title>{copy.panels.sourceTitle}</Panel.Title>
				<Panel.Spacer />
				<FormatSwitch
					label={copy.format.switchLabel}
					value={textFormat}
					options={formatOrder.map((id) => ({
						value: id,
						label: getFormat(id).label,
					}))}
					onChange={(next: TextFormat) =>
						useTabeloStore.getState().setTextFormat(next)
					}
				/>
				<ToolbarButton
					icon={ClipboardCopy}
					label={copy.actions.copySource}
					iconOnly
					onClick={async () => {
						const ok = await writeClipboardText(format.serialize(document));
						if (ok)
							useTabeloStore.setState({ notice: copy.notices.sourceCopied });
					}}
				/>
				<ToolbarButton
					icon={Download}
					label={copy.actions.download}
					iconOnly
					onClick={() =>
						downloadText(
							`table.${format.extension}`,
							format.mimeType,
							format.serialize(document),
						)
					}
				/>
			</Panel.Header>

			<Panel.Body className="overflow-hidden">
				<SourceEditor
					value={draftText}
					format={textFormat}
					invalidLine={invalidLine}
					ariaLabel={copy.a11y.sourceEditor(format.label)}
					onChange={(text) => useTabeloStore.getState().setDraftText(text)}
					onUndoBeyondLocal={() => useTabeloStore.getState().undo()}
					onRedoBeyondLocal={() => useTabeloStore.getState().redo()}
				/>
			</Panel.Body>

			<Panel.Footer>
				<StatusPill
					tone={status.tone}
					label={status.label}
					hint={status.hint}
				/>
				{messages.length > 0 ? (
					<p
						className={
							issues.length > 0
								? "truncate text-status-invalid text-xs"
								: "truncate text-muted-foreground text-xs"
						}
					>
						{messages[0].line !== undefined
							? `Line ${messages[0].line}: `
							: null}
						{messages[0].message}
					</p>
				) : null}
			</Panel.Footer>
		</Panel>
	);
}
