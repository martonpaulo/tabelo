import { Button } from "@tabelo/ui/components/button";
import { Checkbox } from "@tabelo/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Label } from "@tabelo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@tabelo/ui/components/radio-group";
import { useId, useState } from "react";
import { listDownloadableCodecs, outputOptionsFor } from "@/formats";
import type { CodecId, OutputOptionId } from "@/formats/types";
import { downloadText } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { copyToClipboard } from "@/ui/clipboard-actions";
import { copy } from "@/ui/copy";
import { Notice } from "@/ui/primitives/notice";

// Downloading is a choice, not a click: which format, and — where the format
// says it has one — how that file should be written. Both the File menu and
// the keyboard shortcut open this same chooser, so there is one format list
// and one set of options rather than a parallel pair. See docs/adr/0005.

const BASE_FILENAME = "table";

interface DownloadDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

export function DownloadDialog({ open, onOpenChange }: DownloadDialogProps) {
	const codecs = listDownloadableCodecs();
	const [selected, setSelected] = useState<CodecId>(codecs[0].id);
	const outputOptions = useTabeloStore((state) => state.outputOptions);
	const titleId = useId();
	const hintId = useId();

	const codec =
		codecs.find((candidate) => candidate.id === selected) ?? codecs[0];
	// Only the chosen format's own declared options are offered, so the chooser
	// never shows a switch that would do nothing.
	const options = codec.outputOptions ?? [];

	// A draft that has not parsed is not in the document, so the file would be
	// the last valid table. Saying which is the point: a download must never
	// claim to contain work it left out. A clean draft needs no such warning —
	// it was read back into the document the moment it parsed.
	const pendingDraft = useTabeloStore((state) =>
		state.draft && state.draft.status !== "clean" ? state.draft : null,
	);

	const download = () => {
		const document = useTabeloStore.getState().document;
		downloadText(
			`${BASE_FILENAME}.${codec.extension}`,
			codec.mimeType,
			// Only what this format declared: see outputOptionsFor.
			codec.serialize(document, outputOptionsFor(codec, outputOptions)),
		);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={hintId}
				className="text-sm"
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.download.title}</DialogTitle>
					<DialogDescription id={hintId} className="text-sm">
						{copy.download.hint}
					</DialogDescription>
				</DialogHeader>

				{pendingDraft ? (
					<Notice tone="warning">
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

				<RadioGroup
					aria-label={copy.download.format}
					value={selected}
					onValueChange={(value) => setSelected(value as CodecId)}
					className="gap-1"
				>
					{codecs.map((candidate) => (
						<FormatChoice
							key={candidate.id}
							id={candidate.id}
							label={candidate.label}
							extension={candidate.extension}
							options={
								candidate.id === codec.id ? options : ([] as OutputOptionId[])
							}
						/>
					))}
				</RadioGroup>

				<DialogFooter>
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						{copy.actions.cancel}
					</Button>
					<Button variant="outline" size="sm" onClick={download}>
						{copy.actions.download}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface FormatChoiceProps {
	readonly id: CodecId;
	readonly label: string;
	readonly extension: string;
	readonly options: readonly OutputOptionId[];
}

// The options belong to the format they modify, so they sit under it rather
// than in a separate block that would have to name the format again.
function FormatChoice({ id, label, extension, options }: FormatChoiceProps) {
	const radioId = useId();

	return (
		<div>
			<div className="flex min-h-control-md items-center gap-2">
				<RadioGroupItem id={radioId} value={id} />
				<Label htmlFor={radioId} className="flex-1 font-medium text-sm">
					{label}
				</Label>
				<span className="text-muted-foreground text-xs">.{extension}</span>
			</div>
			{options.map((option) => (
				<OutputOption key={option} option={option} />
			))}
		</div>
	);
}

function OutputOption({ option }: { readonly option: OutputOptionId }) {
	const checkboxId = useId();
	const value = useTabeloStore((state) => state.outputOptions[option]);

	return (
		<div className="flex items-start gap-2 py-1 pl-6">
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
