import { Button } from "@tabelo/ui/components/button";
import { Checkbox } from "@tabelo/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Label } from "@tabelo/ui/components/label";
import { type ReactNode, useId, useMemo, useState } from "react";
import { copy } from "@/copy/copy";
import { hasInlineContent } from "@/core/document";
import {
	canSerialize,
	DEFAULT_CODEC_ID,
	getCodec,
	listCodecs,
	outputOptionsFor,
} from "@/formats";
import type {
	CodecId,
	OutputOptionId,
	PreconditionFailure,
} from "@/formats/types";
import { downloadText, tableDownloadFilename } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copyCodecToClipboard, copyToClipboard } from "@/ui/clipboard-actions";
import { preconditionRecovery } from "@/ui/precondition-recovery";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { Notice } from "@/ui/primitives/notice";
import {
	SingleSelectionList,
	SingleSelectionOption,
	singleSelectionDialogContentStyles,
} from "@/ui/primitives/single-selection-list";
import { codecSpelling } from "@/ui/spelling";
import { flattensInlineContent } from "@/views/projection-loss";
import { getView } from "@/views/registry";

// Writing the table out is a choice, not a click. The user chooses the format
// and, where the format offers options, how it should be written. Downloading
// a file and copying to the clipboard are the same choice with two
// destinations, so they share one chooser rather than a menu of formats beside
// a dialog of them (owner, 2026-09-20). See docs/adr/0005.

export type ExportDestination = "download" | "clipboard";

interface DownloadDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly destination?: ExportDestination;
}

export function DownloadDialog({
	open,
	onOpenChange,
	destination = "download",
}: DownloadDialogProps) {
	const codecs = listCodecs();
	const [selected, setSelected] = useState<CodecId>(DEFAULT_CODEC_ID);
	const document = useTabeloStore((state) => state.document);
	const tableName = useTabeloStore((state) => state.name);
	const outputOptions = useTabeloStore((state) => state.outputOptions);
	const titleId = useId();
	const hintId = useId();
	const formatDescriptionId = useId();

	const selectedCodec =
		codecs.find((candidate) => candidate.id === selected) ??
		getCodec(DEFAULT_CODEC_ID);
	const codec =
		canSerialize(selectedCodec, document) === null
			? selectedCodec
			: (codecs.find(
					(candidate) => canSerialize(candidate, document) === null,
				) ?? selectedCodec);
	// Only the chosen format's own declared options are offered, so the chooser
	// never shows a switch that would do nothing.
	const options = codec.outputOptions ?? [];

	// A draft that has not parsed is not in the document, so the file would be
	// the last valid table. Saying which is the point: a download must never
	// claim to contain work it left out. A clean draft needs no such warning.
	// it was read back into the document the moment it parsed.
	const pendingDraft = useTabeloStore((state) =>
		state.draft && state.draft.status !== "clean" ? state.draft : null,
	);

	// A file in a format that cannot spell inline structure holds only what
	// the table reads as. Choosing the format is the user's authorization, so
	// it is said before the download, beside the choice (#306).
	const formatted = useMemo(() => hasInlineContent(document), [document]);
	const flattens = formatted && flattensInlineContent(codec);

	const confirm = () => {
		const failure = canSerialize(codec, document);
		if (failure) return;
		if (destination === "clipboard") {
			void copyCodecToClipboard(codec, document);
			onOpenChange(false);
			return;
		}
		downloadText(
			tableDownloadFilename(tableName, codec.extension),
			codec.mimeType,
			// Only what this format declared: see outputOptionsFor. The spelling
			// is the one this format's pane shows (#397).
			codec.serialize(document, {
				...outputOptionsFor(codec, outputOptions),
				...codecSpelling(codec),
			}),
		);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				aria-labelledby={titleId}
				aria-describedby={hintId}
				width="wide"
				className={singleSelectionDialogContentStyles}
			>
				<DialogHeader>
					<DialogTitle id={titleId}>
						{destination === "clipboard"
							? copy.actions.copyTable
							: copy.actions.downloadTable}
					</DialogTitle>
					<DialogDescription id={hintId} className="text-sm">
						{destination === "clipboard"
							? copy.download.copiesAs(getView(codec.id).label)
							: copy.download.savesAs(
									tableDownloadFilename(tableName, codec.extension),
								)}
					</DialogDescription>
				</DialogHeader>

				{pendingDraft ? (
					<Notice severity="warning">
						<span className="flex-1">{copy.download.invalidDraft}</span>
						<Button
							variant="outline"
							size="xs"
							onClick={() =>
								void copyToClipboard({ text: pendingDraft.text }, "source")
							}
						>
							{copy.download.copyDraft}
						</Button>
					</Notice>
				) : null}

				<SingleSelectionList
					aria-label={copy.download.format}
					aria-describedby={formatDescriptionId}
					className="grid-cols-2"
					value={codec.id}
					onValueChange={(value) => setSelected(value as CodecId)}
				>
					{codecs.map((candidate) => {
						const view = getView(candidate.id);
						return (
							<FormatChoice
								key={candidate.id}
								id={candidate.id}
								icon={<view.icon />}
								label={view.label}
								extension={candidate.extension}
								selected={candidate.id === codec.id}
								failure={canSerialize(candidate, document)}
								onRecover={() => onOpenChange(false)}
							/>
						);
					})}
				</SingleSelectionList>

				{/* The chosen format described once, below the grid, and the
				    options it declares under that description: they belong to the
				    format they modify. */}
				<div className="grid gap-1.5">
					<p id={formatDescriptionId} className="text-muted-foreground text-sm">
						{getView(codec.id).description}
					</p>
					{options.map((option) => (
						<OutputOption key={option} option={option} />
					))}
					{/* Below the formats, with the description it qualifies, so
					    choosing a format never moves the list under the pointer. */}
					{flattens ? (
						<Notice severity="warning">
							<span data-projection-disclosure className="flex-1">
								{copy.download.plainProjection}
							</span>
						</Notice>
					) : null}
				</div>

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm onClick={confirm}>
						{destination === "clipboard"
							? copy.download.copyAsFormat(getView(codec.id).label)
							: copy.download.downloadAs(
									codec.extension.split(".").at(-1) ?? codec.extension,
								)}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}

interface FormatChoiceProps {
	readonly id: CodecId;
	readonly icon: ReactNode;
	readonly label: string;
	readonly extension: string;
	readonly selected: boolean;
	readonly failure: PreconditionFailure | null;
	readonly onRecover: () => void;
}

// One tile of the format grid. A format the table cannot be written in takes
// the whole row, so its refusal and correction have room beside the name.
function FormatChoice({
	id,
	icon,
	label,
	extension,
	selected,
	failure,
	onRecover,
}: FormatChoiceProps) {
	return (
		<div className={failure ? "col-span-2" : undefined}>
			<SingleSelectionOption
				compact
				value={id}
				selected={selected}
				availability={
					failure
						? {
								kind: "unavailable",
								reason: copy.disabled.codecPrecondition(failure),
							}
						: undefined
				}
				recovery={preconditionRecovery(failure) ?? undefined}
				onRecover={onRecover}
				icon={icon}
				label={label}
				metadata={copy.download.fileExtension(extension)}
			/>
		</div>
	);
}

function OutputOption({ option }: { readonly option: OutputOptionId }) {
	const checkboxId = useId();
	const value = useTabeloStore((state) => state.outputOptions[option]);

	return (
		<div className="flex items-start gap-2 py-1">
			<Checkbox
				id={checkboxId}
				checked={value}
				onCheckedChange={(checked) =>
					useTabeloStore.getState().setOutputOption(option, checked === true)
				}
				className="mt-0.5"
			/>
			<div className="min-w-0 flex-1">
				<Label htmlFor={checkboxId} className="font-normal text-sm">
					{copy.download.option(option)}
				</Label>
				<p className="text-muted-foreground text-xs">
					{copy.download.optionHint(option)}
				</p>
			</div>
		</div>
	);
}
