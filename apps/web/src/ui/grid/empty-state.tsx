import { modShortcut } from "@tabelo/ui/lib/platform";
import { cn } from "@tabelo/ui/lib/utils";
import {
	ClipboardPaste,
	ExternalLink,
	FileUp,
	type LucideIcon,
	Plus,
	Table2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { copy } from "@/copy/copy";
import { product } from "@/copy/product";
import { DEFAULT_COLUMN_COUNT } from "@/core/document";
import { listCodecs } from "@/formats";
import { pasteFromClipboard } from "@/ui/clipboard-actions";
import { importTableFile } from "@/ui/import";

// The file endings the import accepts, from the codec registry rather than a
// list written here (docs/adr/0005). `jira.txt` and `records.txt` both end in
// `.txt`, so the last segment is what a reader recognises, once.
const importExtensions = [
	...new Set(
		listCodecs().map((codec) => `.${codec.extension.split(".").at(-1)}`),
	),
];

// The first-visit choice is one product-owned surface over the normal workspace.
// The workspace remains visible enough to explain where the table will appear,
// but is inert until the user chooses how to begin. Each way in is one large
// option with a line saying what it takes, the empty table first and filled,
// because it is the one that always works.
export function EmptyState({
	onStartEmpty,
	onStarted,
}: {
	readonly onStartEmpty: () => void;
	readonly onStarted: () => void;
}) {
	const sectionRef = useRef<HTMLElement>(null);

	// The surface takes focus so a screen reader starts on it and Enter starts
	// the empty table. It is a container, not a control, so it draws no focus
	// ring: the ring belongs to the options, the first of which is one Tab away.
	useLayoutEffect(() => {
		sectionRef.current?.focus();
	}, []);

	const startImport = () => {
		void importTableFile().then((started) => {
			if (started) onStarted();
		});
	};

	// Mod+O is the platform's "open a file", and on this surface opening a file
	// is one of the three ways in, so the shortcut the option shows works from
	// anywhere while the surface is up. Paste needs no handler here: the app
	// already turns a trusted paste event into an import while it is open.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				!event.shiftKey &&
				event.key.toLowerCase() === "o"
			) {
				event.preventDefault();
				startImport();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});

	return (
		<div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-app/60 p-4 supports-backdrop-filter:backdrop-blur-sm">
			<section
				ref={sectionRef}
				aria-labelledby="empty-state-title"
				tabIndex={-1}
				data-focus-container
				// Enter on the surface itself starts the empty table, the option the
				// surface marks as primary. Enter on a focused option is that
				// option's own activation and is left alone.
				onKeyDown={(event) => {
					if (event.key === "Enter" && event.target === event.currentTarget) {
						event.preventDefault();
						onStartEmpty();
					}
				}}
				className="w-[min(26rem,calc(100vw-2rem))] rounded-surface bg-popover p-6 text-popover-foreground shadow-md outline-none ring-1 ring-line-strong"
			>
				<h2
					id="empty-state-title"
					className="flex items-center gap-2 font-semibold text-xl"
				>
					<Table2 aria-hidden className="size-6 text-selection-edge" />
					{copy.empty.title}
				</h2>
				<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
					{copy.empty.intro}.
				</p>
				<div className="mt-6 flex flex-col gap-2">
					<Option
						primary
						icon={Plus}
						label={copy.empty.emptyAction}
						detail={copy.empty.emptyDetail(DEFAULT_COLUMN_COUNT)}
						shortcut={{ keys: "Enter", shown: "Enter" }}
						onClick={onStartEmpty}
					/>
					<Option
						icon={ClipboardPaste}
						label={copy.empty.pasteHint}
						detail={copy.empty.pasteDetail}
						shortcut={{ keys: "Meta+V Control+V", shown: modShortcut("V") }}
						onClick={() => {
							void pasteFromClipboard().then((started) => {
								if (started) onStarted();
							});
						}}
					/>
					<Option
						icon={FileUp}
						label={copy.actions.importFile}
						detail={copy.empty.importDetail(importExtensions)}
						shortcut={{ keys: "Meta+O Control+O", shown: modShortcut("O") }}
						onClick={startImport}
					/>
				</div>
				<div className="mt-6 flex flex-col items-center gap-1 text-muted-foreground text-xs">
					<p>
						{copy.empty.credit}{" "}
						<ExternalLinkText href={product.author.url}>
							{product.author.name}
						</ExternalLinkText>
					</p>
					<p>
						<ExternalLinkText href={product.repositoryUrl}>
							{copy.empty.source}
						</ExternalLinkText>
					</p>
				</div>
			</section>
		</div>
	);
}

// A link that leaves Tabelo says so before it is followed: the arrow is the
// visible cue, and the accessible name says it opens in a new tab.
function ExternalLinkText({
	href,
	children,
}: {
	readonly href: string;
	readonly children: string;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-foreground hover:underline"
		>
			{children}
			<ExternalLink aria-hidden className="size-3" />
			<span className="sr-only">{copy.a11y.opensInNewTab}</span>
		</a>
	);
}

function Option({
	primary = false,
	icon: Icon,
	label,
	detail,
	shortcut,
	onClick,
}: {
	readonly primary?: boolean;
	readonly icon: LucideIcon;
	readonly label: string;
	readonly detail: string;
	// `keys` is the ARIA spelling for assistive technology; `shown` is the
	// platform's own spelling, drawn as one run of text the way a menu shows it.
	readonly shortcut?: { readonly keys: string; readonly shown: string };
	readonly onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-keyshortcuts={shortcut?.keys}
			data-variant={primary ? "default" : "ghost"}
			onClick={onClick}
			className={cn(
				"flex w-full cursor-pointer items-center gap-3 rounded-interactive px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-selection-edge focus-visible:outline-offset-2",
				primary
					? "bg-primary text-primary-foreground hover:bg-primary/90"
					: "bg-muted text-foreground hover:bg-muted/70",
			)}
		>
			<Icon aria-hidden className="size-5 shrink-0" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="font-medium text-sm">{label}</span>
				<span
					className={cn(
						"text-xs",
						primary ? "text-primary-foreground" : "text-muted-foreground",
					)}
				>
					{detail}
				</span>
			</span>
			{shortcut ? (
				<span
					aria-hidden
					className={cn(
						"shrink-0 font-source text-xs",
						primary ? "text-primary-foreground" : "text-muted-foreground",
					)}
				>
					{shortcut.shown}
				</span>
			) : null}
		</button>
	);
}
