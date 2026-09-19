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
import { type ReactNode, useId, useState } from "react";
import { copy } from "@/copy/copy";
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
import { copyToClipboard } from "@/ui/clipboard-actions";
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
import { getView } from "@/views/registry";

// Downloading is a choice, not a click. The user chooses the format and, where
// the format offers options, how the file should be written. Both the File menu and
// the keyboard shortcut open this same chooser, so there is one format list
// and one set of options rather than a parallel pair. See docs/adr/0005.

interface DownloadDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

export function DownloadDialog({ open, onOpenChange }: DownloadDialogProps) {
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

	const download = () => {
		const failure = canSerialize(codec, document);
		if (failure) return;
		downloadText(
			tableDownloadFilename(tableName, codec.extension),
			codec.mimeType,
			// Only what this format declared: see outputOptionsFor.
			codec.serialize(document, outputOptionsFor(codec, outputOptions)),
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
					<DialogTitle id={titleId}>{copy.actions.downloadTable}</DialogTitle>
					<DialogDescription id={hintId} className="text-sm">
						{copy.download.savesAs(
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
				</div>

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm onClick={download}>
						{copy.download.downloadAs(
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
