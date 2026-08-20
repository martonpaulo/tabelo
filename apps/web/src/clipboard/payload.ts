import { z } from "zod";
import {
	cellText,
	cellValueType,
	EXPECTED_COLUMN_TYPES,
} from "@/core/cell-value";
import type { CellValue, ExpectedColumnType } from "@/core/types";

// Tabelo's own clipboard flavour: the types that TSV and HTML cannot spell.
//
// The transport was decided by measurement rather than preference. A custom
// MIME flavour round-trips through DataTransfer in both engines, but Firefox
// refuses to write one through the asynchronous API at all
// ("NotAllowedError: Type 'web application/x-tabelo+json' not supported for
// write"), and that refusal takes the public flavours down with it. An inert
// comment inside the HTML flavour survived every path in both engines, so it
// is the one transport rather than one of two.
//
// This schema is versioned on its own. It describes bytes in flight between
// two Tabelo tabs, which is a different compatibility window from a stored
// document, so it must never follow the persistence version.

export const CLIPBOARD_PAYLOAD_VERSION = 1;

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
const cellValueSchema = z.union([
	z.string(),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);

// Strict on purpose. An unknown key means the payload was written by something
// that is not this version of Tabelo, and the answer to that is to fall back
// to the public flavours rather than to guess which half is still readable.
const payloadSchema = z.strictObject({
	version: z.literal(CLIPBOARD_PAYLOAD_VERSION),
	fingerprint: z.string().min(1),
	expectedTypes: z.array(z.enum(EXPECTED_COLUMN_TYPES)),
	matrix: z.array(z.array(cellValueSchema)),
});

// FNV-1a over a type-tagged rendering of the selection. Deterministic, and it
// separates `35` from `"35"` and `null` from `""`, which is exactly the
// distinction the payload exists to carry. It answers one question: are these
// the bytes Tabelo wrote? Consistency with the public flavours is a separate
// check, because a hash of the payload cannot speak for content beside it.
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
			absorb(`${cellValueType(value)}:${cellText(value)}`);
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
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
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

	const parsed = payloadSchema.safeParse(value);
	if (!parsed.success) return { html: stripped, selection: null };

	const selection: ClipboardSelection = {
		matrix: parsed.data.matrix,
		expectedTypes: parsed.data.expectedTypes,
	};
	// Recomputed rather than trusted. A payload that was truncated or edited in
	// transit stops matching the hash written beside it.
	if (parsed.data.fingerprint !== fingerprintOf(selection)) {
		return { html: stripped, selection: null };
	}

	return { html: stripped, selection };
}
