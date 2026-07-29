import { describe, expect, it, vi } from "vitest";
import { documentFromMatrix } from "@/core/document";
import {
	canSerialize,
	filterSerializableCodecs,
	markdownCodec,
} from "@/formats";
import type { TableCodec } from "@/formats/types";

const document = documentFromMatrix([["Name"], ["Inez"]], {
	headerRow: true,
});

function decliningCodec(precondition: TableCodec["precondition"]): TableCodec {
	return { ...markdownCodec, precondition };
}

describe("codec document preconditions", () => {
	it("returns no failure when a codec has no precondition", () => {
		expect(canSerialize(markdownCodec, document)).toBeNull();
	});

	it("returns and memoises a declared failure by document identity", () => {
		const precondition = vi.fn(() => ({
			code: "test-conflict",
			columns: [0],
		}));
		const codec = decliningCodec(precondition);

		expect(canSerialize(codec, document)).toEqual({
			code: "test-conflict",
			columns: [0],
		});
		expect(canSerialize(codec, document)).toEqual({
			code: "test-conflict",
			columns: [0],
		});
		expect(precondition).toHaveBeenCalledOnce();
	});

	it("filters codecs that cannot represent the document", () => {
		const blocked = decliningCodec(() => ({
			code: "test-conflict",
			rows: [0],
		}));

		expect(
			filterSerializableCodecs([markdownCodec, blocked], document),
		).toEqual([markdownCodec]);
	});
});
