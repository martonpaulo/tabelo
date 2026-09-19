import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Input } from "@tabelo/ui/components/input";
import { Label } from "@tabelo/ui/components/label";
import { cn } from "@tabelo/ui/lib/utils";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import type { LinkDraft } from "@/core/cell-formatting";
import {
	DialogActions,
	DialogAlternative,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";

// The Visual Table's two formatting dialogs (#306): a link needs its text and
// its address together, and an image its address and its alternative text, so
// neither fits in a menu. Both are the direct result of a command, open at the
// narrow width, take focus in their first field, and hand focus back to where
// the command came from, a cell or the cell editor, whichever answer closed
// them. Nothing reaches the document until Save or Insert: Cancel leaves no
// partial state behind. The caller owns what the answer does, so the same
// dialog serves a whole cell and a range of text being edited.

export interface LinkRequest {
	readonly draft: LinkDraft;
	readonly onSave: (text: string, url: string) => void;
	readonly onRemove: () => void;
	readonly finalFocus: () => HTMLElement | null;
}

export interface ImageRequest {
	readonly onInsert: (url: string, alt: string) => void;
	readonly finalFocus: () => HTMLElement | null;
}

// A field, its label, and the one line under it that is either the hint or
// the error, and keeps its height either way so nothing below it moves.
function Field({
	label,
	hint,
	error,
	value,
	onChange,
	inputRef,
}: {
	readonly label: string;
	readonly hint?: string;
	readonly error: string | null;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
	const id = useId();
	const noteId = useId();
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				ref={inputRef}
				id={id}
				value={value}
				spellCheck={false}
				aria-invalid={error ? true : undefined}
				aria-describedby={noteId}
				onChange={(event) => onChange(event.target.value)}
			/>
			<p
				id={noteId}
				className={cn(
					"min-h-5 text-sm",
					error ? "text-destructive" : "text-muted-foreground",
				)}
				role={error ? "alert" : undefined}
			>
				{error ?? hint}
			</p>
		</div>
	);
}

export function LinkDialog({
	request,
	onClose,
}: {
	// The link being added or edited, or null while the dialog is closed.
	readonly request: LinkRequest | null;
	readonly onClose: () => void;
}) {
	const open = request !== null;
	const draft = request?.draft;
	const [text, setText] = useState("");
	const [url, setUrl] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const titleId = useId();
	const firstField = useRef<HTMLInputElement>(null);
	// The request that opened the dialog stays readable through the close
	// transition, when `request` is already null, so focus goes back to it.
	const lastRequest = useRef<LinkRequest | null>(null);
	if (request) lastRequest.current = request;

	// Each opening starts from what the range holds, not the last draft.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!draft) return;
		setText(draft.text);
		setUrl(draft.url);
		setSubmitted(false);
	}, [request]);

	const textError = submitted && text === "" ? copy.link.textRequired : null;
	const urlError =
		submitted && url.trim() === "" ? copy.link.addressRequired : null;
	const unchanged =
		draft?.linked === true && text === draft.text && url === draft.url;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setSubmitted(true);
		if (!request || text === "" || url.trim() === "" || unchanged) return;
		// The address is kept as typed, apart from the spaces around it that a
		// paste tends to bring along.
		request.onSave(text, url.trim());
		onClose();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				aria-labelledby={titleId}
				initialFocus={firstField}
				finalFocus={() => lastRequest.current?.finalFocus() ?? null}
			>
				<form className="grid gap-4" onSubmit={submit}>
					<DialogHeader>
						<DialogTitle id={titleId}>
							{draft?.linked ? copy.link.editTitle : copy.link.addTitle}
						</DialogTitle>
					</DialogHeader>
					<Field
						label={copy.link.text}
						error={textError}
						value={text}
						onChange={setText}
						inputRef={firstField}
					/>
					<Field
						label={copy.link.address}
						hint={copy.link.addressHint}
						error={urlError}
						value={url}
						onChange={setUrl}
					/>
					<DialogActions>
						<DialogAlternative
							type="button"
							disabledReason={draft?.linked ? undefined : copy.link.noLink}
							onClick={() => {
								request?.onRemove();
								onClose();
							}}
						>
							{copy.link.remove}
						</DialogAlternative>
						<DialogCancel>{copy.actions.cancel}</DialogCancel>
						<DialogConfirm
							type="submit"
							disabledReason={unchanged ? copy.link.unchanged : undefined}
						>
							{copy.link.confirm}
						</DialogConfirm>
					</DialogActions>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function ImageDialog({
	request,
	onClose,
}: {
	readonly request: ImageRequest | null;
	readonly onClose: () => void;
}) {
	const open = request !== null;
	const [url, setUrl] = useState("");
	const [alt, setAlt] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const titleId = useId();
	const firstField = useRef<HTMLInputElement>(null);
	const lastRequest = useRef<ImageRequest | null>(null);
	if (request) lastRequest.current = request;

	// Each opening starts empty.
	useEffect(() => {
		if (!request) return;
		setUrl("");
		setAlt("");
		setSubmitted(false);
	}, [request]);

	const urlError =
		submitted && url.trim() === "" ? copy.image.addressRequired : null;
	const altError =
		submitted && alt.trim() === "" ? copy.image.altRequired : null;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setSubmitted(true);
		if (!request || url.trim() === "" || alt.trim() === "") return;
		request.onInsert(url.trim(), alt);
		onClose();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				aria-labelledby={titleId}
				initialFocus={firstField}
				finalFocus={() => lastRequest.current?.finalFocus() ?? null}
			>
				<form className="grid gap-4" onSubmit={submit}>
					<DialogHeader>
						<DialogTitle id={titleId}>{copy.image.title}</DialogTitle>
					</DialogHeader>
					<Field
						label={copy.image.address}
						hint={copy.image.addressHint}
						error={urlError}
						value={url}
						onChange={setUrl}
						inputRef={firstField}
					/>
					<Field
						label={copy.image.alt}
						hint={copy.image.altHint}
						error={altError}
						value={alt}
						onChange={setAlt}
					/>
					<DialogActions>
						<DialogCancel>{copy.actions.cancel}</DialogCancel>
						<DialogConfirm type="submit">{copy.image.confirm}</DialogConfirm>
					</DialogActions>
				</form>
			</DialogContent>
		</Dialog>
	);
}
