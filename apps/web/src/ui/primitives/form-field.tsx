import { Label } from "@tabelo/ui/components/label";
import { cn } from "@tabelo/ui/lib/utils";
import { type ReactNode, useId } from "react";

// The attributes a field hands its one control, so the label, the invalid
// state and the description stay wired the same way in every form.
export interface FormFieldControlProps {
	readonly id: string;
	readonly "aria-invalid": true | undefined;
	readonly "aria-describedby": string | undefined;
}

// A field, its label, and the one line under it that is either the hint or
// the field's own error (#451). Only an error about the value in this field
// belongs here: it marks the control invalid and becomes its description. A
// failed operation, such as storage refusing a save or a connection that did
// not open, is the form's message, never this field's, because the value is
// still valid and retrying it must stay possible.
//
// The caller owns the control, its value and when validation runs; this owns
// only the anatomy and the ids between its parts.
export function FormField({
	label,
	hint,
	error,
	reserveLine = false,
	children,
}: {
	readonly label: string;
	readonly hint?: ReactNode;
	readonly error: string | null;
	// Keeps the note's line when it is empty, so an error appearing never
	// moves what is below the field.
	readonly reserveLine?: boolean;
	readonly children: (control: FormFieldControlProps) => ReactNode;
}) {
	const id = useId();
	const noteId = useId();
	const note = error ?? hint ?? null;
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>{label}</Label>
			{children({
				id,
				"aria-invalid": error ? true : undefined,
				"aria-describedby": note === null ? undefined : noteId,
			})}
			{note !== null || reserveLine ? (
				<p
					id={noteId}
					className={cn(
						"text-sm",
						reserveLine && "min-h-5",
						error ? "text-destructive" : "text-muted-foreground",
					)}
					role={error ? "alert" : undefined}
				>
					{note}
				</p>
			) : null}
		</div>
	);
}

// The form's own message when an operation on valid input failed: storage
// refused a save, a connection did not open. It describes no field and marks
// none invalid, so the input stays as typed and the form's actions stay the
// way to retry or leave (#451).
export function FormFailure({ children }: { readonly children: ReactNode }) {
	return (
		<p role="alert" className="text-destructive text-sm">
			{children}
		</p>
	);
}
