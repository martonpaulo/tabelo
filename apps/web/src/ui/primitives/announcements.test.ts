import { describe, expect, it } from "vitest";
import {
	type AnnouncedRecord,
	type Announcement,
	freshAnnouncements,
} from "@/ui/primitives/announcements";

// Runs a sequence of renders through the rule and returns what each one
// would write, by message.
function written(
	renders: readonly (readonly Announcement[])[],
): readonly (readonly string[])[] {
	let record: AnnouncedRecord = new Map();
	return renders.map((announcements) => {
		const result = freshAnnouncements(record, announcements);
		record = result.record;
		return result.fresh.map((announcement) => announcement.message);
	});
}

const condition = (
	message: string,
	urgency: Announcement["urgency"] = "assertive",
): Announcement => ({ id: "condition-input-error", message, urgency });

const confirmation: Announcement = {
	id: "notice-1",
	message: "copied",
	urgency: "polite",
};

describe("freshAnnouncements", () => {
	it("announces a new identifier once", () => {
		expect(written([[confirmation], [confirmation]])).toEqual([["copied"], []]);
	});

	it("announces consecutive distinct messages under one identifier", () => {
		expect(
			written([[condition("first error")], [condition("second error")]]),
		).toEqual([["first error"], ["second error"]]);
	});

	it("announces a changed detail, which is part of the spoken text", () => {
		expect(
			written([
				[condition("unreadable. recovery saved")],
				[condition("unreadable. recovery quota full")],
			]),
		).toEqual([
			["unreadable. recovery saved"],
			["unreadable. recovery quota full"],
		]);
	});

	it("does not repeat an unchanged message", () => {
		expect(
			written([[condition("same")], [condition("same")], [condition("same")]]),
		).toEqual([["same"], [], []]);
	});

	it("announces an urgency change in the region for the new urgency", () => {
		let record: AnnouncedRecord = new Map();
		record = freshAnnouncements(record, [condition("same", "polite")]).record;
		const { fresh } = freshAnnouncements(record, [
			condition("same", "assertive"),
		]);
		expect(fresh).toEqual([condition("same", "assertive")]);
	});

	it("does not re-read a survivor when another notice is removed", () => {
		expect(
			written([[condition("error"), confirmation], [condition("error")]]),
		).toEqual([["error", "copied"], []]);
	});

	it("announces a message again once it has left and returned", () => {
		expect(written([[condition("error")], [], [condition("error")]])).toEqual([
			["error"],
			[],
			["error"],
		]);
	});
});
