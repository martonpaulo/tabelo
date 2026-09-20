import { z } from "zod";
import {
	cellText,
	cellValueType,
	EXPECTED_COLUMN_TYPES,
} from "@/core/cell-value";
import { isInlineContent, isValidInlineContent } from "@/core/inline-content";
import type {
	CellValue,
	ExpectedColumnType,
	InlineContent,
} from "@/core/types";

// Tabelo's own clipboard flavour: the types that TSV and HTML cannot spell.
//
// The transport was decided by measurement rather than preference, and the
// measurement was re-taken on Chromium alone in #266, once the engine-specific
// reason behind it stopped applying (#265). The conclusion survived, for a
// different reason.
//
// Chromium keeps two separate stores for a custom clipboard type. A type
// written through `DataTransfer.setData` on a copy event lands in the pickled
// custom-data format, while a "web "-prefixed type written through
// `ClipboardItem` lands in the web custom format map, and neither reader sees
// the other's store. Reproduced on all four combinations: a payload written as
// `web application/x-tabelo+json` on the copy event is absent from
// `navigator.clipboard.read()`, and one written through `ClipboardItem` is
// absent from the paste event's `clipboardData`.
// https://chromium.googlesource.com/chromium/src/+/main/content/browser/renderer_host/clipboard_host_impl.cc
//
// Tabelo copies and pastes from both a keyboard event and a menu command, so a
// flavour of its own would carry the types through two of those four paths and
// silently drop them through the other two: a number would arrive as its text
// and a column's expectation would vanish. An inert comment in the HTML
// flavour reaches every path, because HTML is the only carrier both transports
// share. Priority 1 is data preservation, so the shared carrier wins over the
// tidier one, and e2e/clipboard-transports.spec.ts holds that result.
//
// This schema is versioned on its own. It describes bytes in flight between
// two Tabelo tabs, which is a different compatibility window from a stored
// document, so it must never follow the persistence version.

// Version 2 adds inline content to the matrix (#306). A version-1 payload is
// still read, because a tab loaded before that change keeps writing it: every
// value it can hold is a valid version-2 value, so reading it migrates nothing
// but the version. A version-2 payload read by such a tab fails its strict
// schema and falls back to the public flavours, which is the behaviour this
// schema already promises for anything it does not recognise.
export const CLIPBOARD_PAYLOAD_VERSION = 2;

// The payload is untrusted input that arrives with no length declared, so it
// is bounded before anything decodes it. This is the clipboard's own budget:
// the import limits govern the public content a user is pasting, and the
// private flavour is not part of that content.
const MAX_PAYLOAD_BYTES = 1_048_576;

// Base64 spends four characters on every three bytes, so the encoded length
// answers how large the decoded payload would be without decoding it first.
const MAX_ENCODED_LENGTH = Math.ceil(MAX_PAYLOAD_BYTES / 3) * 4;

// One HTML comment. A comment is inert twice over: it never renders, and
// `textContent` skips comment nodes, so it cannot reach a cell even in the
// paths that do not strip it first.
//
// The content is matched loosely rather than as base64, because this pattern
// answers "is this Tabelo's marker" and not "is it readable". A marker that
// arrives corrupted still has to be removed, and the decoding below is what
// decides whether anything inside it can be believed.
const PAYLOAD_PATTERN = /<!--tabelo:([\s\S]*?)-->/;

// What a Tabelo-to-Tabelo paste needs beyond the visible text: the values with
// their types, and what each selected column expects to be typed into it.
export interface ClipboardSelection {
	readonly matrix: readonly (readonly CellValue[])[];
	readonly expectedTypes: readonly ExpectedColumnType[];
}

// A non-finite number is not a cell value: JSON writes `NaN` and `Infinity` as
// `null`, so accepting one would turn a number into a different type between
// the two ends of the clipboard. Persistence refuses it for the same reason.
const scalarSchema = z.union([
	z.string(),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);

// Inline content is accepted only in the exact normalized form the core
// defines, so a payload that differs from what Tabelo writes is not read.
const inlineContentSchema = z.custom<InlineContent>(isValidInlineContent);

// Strict on purpose. An unknown key means the payload was written by something
// that is not a version of Tabelo this schema knows, and the answer to that is
// to fall back to the public flavours rather than to guess which half is still
// readable.
const payloadShape = {
	fingerprint: z.string().min(1),
	expectedTypes: z.array(z.enum(EXPECTED_COLUMN_TYPES)),
};

const payloadV1Schema = z.strictObject({
	version: z.literal(1),
	...payloadShape,
	matrix: z.array(z.array(scalarSchema)),
});

const payloadSchema = z.strictObject({
	version: z.literal(CLIPBOARD_PAYLOAD_VERSION),
	...payloadShape,
	matrix: z.array(z.array(z.union([scalarSchema, inlineContentSchema]))),
});

type Payload = z.infer<typeof payloadSchema>;

// The current payload, or an older one migrated forward to it. Null for
// anything else.
function parsePayload(value: unknown): Payload | null {
	const current = payloadSchema.safeParse(value);
	if (current.success) return current.data;
	const legacy = payloadV1Schema.safeParse(value);
	if (legacy.success) {
		return { ...legacy.data, version: CLIPBOARD_PAYLOAD_VERSION };
	}
	return null;
}

// The type-tagged rendering of one value. A scalar renders exactly as version
// 1 rendered it, so a version-1 fingerprint still verifies. Inline content is
// tagged apart from a string, because formatted text and plain text that read
// the same are different values. Each token opens with the unit separator,
// which is how version 1 kept one cell's rendering from running into the next.
function fingerprintToken(value: CellValue): string {
	if (isInlineContent(value)) {
		return `inline:${JSON.stringify(value.nodes)}`;
	}
	return `${cellValueType(value)}:${cellText(value)}`;
}

// FNV-1a over a type-tagged rendering of the selection. Deterministic, and it
// separates `35` from `"35"`, `null` from `""`, and formatted from plain text,
// which is exactly the distinction the payload exists to carry. It answers one
// question: are these the bytes Tabelo wrote? Consistency with the public
// flavours is a separate check, because a hash of the payload cannot speak for
// content beside it.
// https://en.wikipedia.org/wiki/Fowler-Noll-Vo_hash_function
function fingerprintOf(selection: ClipboardSelection): string {
	let hash = 0x811c9dc5;
	const absorb = (text: string): void => {
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 0x01000193);
		}
	};

	absorb(selection.expectedTypes.join(","));
	for (const row of selection.matrix) {
		absorb("");
		for (const value of row) {
			absorb(fingerprintToken(value));
		}
	}
	return (hash >>> 0).toString(16);
}

// btoa speaks latin1 and table content does not, so the JSON is encoded to
// UTF-8 bytes first. Built one character at a time rather than by spreading
// the array into String.fromCharCode, which overflows the call stack on a
// payload of any size.
function toBase64(json: string): string {
	const bytes = new TextEncoder().encode(json);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(encoded: string): string | null {
	try {
		const binary = atob(encoded);
		// A pre-sized buffer filled in place. Uint8Array.from over the string
		// pays an iterator step and a callback per byte, which measured 3.03 ms
		// on a 73 KB payload against 0.11 ms here. The two agree because atob
		// returns latin1, where a code point and a code unit are the same byte.
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

// Written into the HTML flavour beside the table it describes. A selection too
// large to bound is simply not carried: the copy still lands as text and HTML,
// so the values survive and only their types do not. Refusing the copy instead
// would trade a type for the data, which the product's priority order forbids.
export function embedTabeloPayload(
	html: string,
	selection: ClipboardSelection,
): string {
	const encoded = toBase64(
		JSON.stringify({
			version: CLIPBOARD_PAYLOAD_VERSION,
			fingerprint: fingerprintOf(selection),
			expectedTypes: selection.expectedTypes,
			matrix: selection.matrix,
		}),
	);
	if (encoded.length > MAX_ENCODED_LENGTH) return html;
	return `<!--tabelo:${encoded}-->${html}`;
}

// Removes Tabelo's own comment and nothing else. Every reader of the HTML
// flavour runs this first, so the private bytes never reach a parser, a cell,
// or the import budget, whether or not they turn out to be readable.
export function stripTabeloPayload(html: string): string {
	return html.replace(PAYLOAD_PATTERN, "");
}

export interface SplitClipboardHtml {
	// The HTML as an external application would see it.
	readonly html: string;
	// The selection Tabelo wrote, or null when there was none, when it did not
	// validate, or when it was not written by this schema version.
	readonly selection: ClipboardSelection | null;
}

export function readTabeloPayload(html: string): SplitClipboardHtml {
	const stripped = stripTabeloPayload(html);
	const encoded = PAYLOAD_PATTERN.exec(html)?.[1];
	if (!encoded || encoded.length > MAX_ENCODED_LENGTH) {
		return { html: stripped, selection: null };
	}

	const json = fromBase64(encoded);
	if (json === null) return { html: stripped, selection: null };

	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		return { html: stripped, selection: null };
	}

	const parsed = parsePayload(value);
	if (!parsed) return { html: stripped, selection: null };

	const selection: ClipboardSelection = {
		matrix: parsed.matrix,
		expectedTypes: parsed.expectedTypes,
	};
	// Recomputed rather than trusted. A payload that was truncated or edited in
	// transit stops matching the hash written beside it.
	if (parsed.fingerprint !== fingerprintOf(selection)) {
		return { html: stripped, selection: null };
	}

	return { html: stripped, selection };
}
