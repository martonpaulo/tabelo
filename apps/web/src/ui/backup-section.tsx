import { Button } from "@tabelo/ui/components/button";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import { useId, useState } from "react";
import { copy } from "@/copy/copy";
import { BACKUP_MAX_BYTES } from "@/persistence/backup";
import { downloadText, pickTextFile } from "@/platform/files";
import { useTabeloStore } from "@/state/store";
import { FormFailure } from "@/ui/primitives/form-field";

// Backing up and restoring the whole library, beside the other control over
// what this browser keeps (#430). Restoring only adds tables, so it asks
// nothing first; its result is written below the buttons, where the user is
// looking, and announced as a status.
export function BackupSection() {
	const labelId = useId();
	const [result, setResult] = useState<{
		readonly text: string;
		readonly failed: boolean;
	} | null>(null);

	const download = () => {
		const outcome = useTabeloStore.getState().backupLibrary();
		if (outcome.status === "empty") {
			setResult({ text: copy.backup.empty, failed: true });
			return;
		}
		const day = new Date().toISOString().slice(0, 10);
		downloadText(`tabelo-backup-${day}.json`, "application/json", outcome.text);
		setResult({
			text: copy.backup.downloaded(outcome.tables, outcome.skipped),
			failed: false,
		});
	};

	const restore = async () => {
		const file = await pickTextFile(".json,application/json", BACKUP_MAX_BYTES);
		if (!file) return;
		if (file.status !== "selected") {
			setResult({ text: copy.backup.failure[file.status], failed: true });
			return;
		}
		const outcome = useTabeloStore.getState().restoreLibrary(file.text);
		if (outcome.status === "saved") {
			setResult({ text: copy.backup.restored(outcome.tables), failed: false });
		} else {
			setResult({
				text: copy.backup.failure[
					outcome.status === "invalid" ? outcome.reason : outcome.status
				],
				failed: true,
			});
		}
	};

	return (
		<section
			className="border-line-subtle grid gap-2 border-t pt-4"
			aria-labelledby={labelId}
		>
			<h3 id={labelId} className="text-sm font-medium">
				{copy.backup.label}
			</h3>
			<p className="text-muted-foreground -mt-1 text-sm">
				{copy.backup.description}
			</p>
			<div className="flex flex-wrap gap-2">
				<Button type="button" variant="outline" onClick={download}>
					<IconDownload aria-hidden />
					{copy.backup.download}
				</Button>
				<Button type="button" variant="outline" onClick={() => void restore()}>
					<IconUpload aria-hidden />
					{copy.backup.restore}
				</Button>
			</div>
			{result === null ? null : result.failed ? (
				<FormFailure>{result.text}</FormFailure>
			) : (
				<p role="status" className="text-sm">
					{result.text}
				</p>
			)}
		</section>
	);
}
