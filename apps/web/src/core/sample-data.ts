// The project's synthetic people, in one place, so a fixture, a manual check,
// or a documentation example never has to invent a new cast. Everything here
// is made up: see the sample-data rule in AGENTS.md for why that matters and
// which names are allowed.
//
// The roster is ordered, and the first two entries are `Ingrid` and `Paulo`
// with their fixed cities. A fixture that needs one or two rows takes them
// from the front and matches every older fixture written before this file
// existed; a fixture that needs more takes as many as it needs.

export interface SamplePerson {
	readonly name: string;
	readonly city: string;
	readonly role: string;
	// Kept as a string even though a cell may hold a number, because nothing
	// derives a type from text: a numeric-looking value that arrived as text is
	// text. A fixture typing this as a number would imply an inference that
	// does not exist. See docs/adr/0008.
	readonly age: string;
}

export const samplePeople: readonly SamplePerson[] = [
	{ name: "Ingrid", city: "Rio", role: "Designer", age: "35" },
	{ name: "Paulo", city: "Madrid", role: "Developer", age: "35" },
	{ name: "Mabel", city: "Buenos Aires", role: "Writer", age: "45" },
	{ name: "Felix", city: "Mexico City", role: "Analyst", age: "60" },
	{ name: "Amora", city: "Tokyo", role: "Doctor", age: "25" },
];

export const samplePeopleHeaders = ["name", "city", "role", "age"] as const;

// The roster as a plain matrix, header row first, which is the shape the
// codecs and table operations already speak. `rows` bounds how much of the
// roster to take, so a test that only needs two rows does not carry five.
export function samplePeopleMatrix(rows = samplePeople.length): string[][] {
	return [
		[...samplePeopleHeaders],
		...samplePeople
			.slice(0, rows)
			.map((person) => [person.name, person.city, person.role, person.age]),
	];
}

// The same roster as pasteable text, for the cases that exercise import,
// paste, or a source view rather than the document directly.
export function samplePeopleCsv(rows = samplePeople.length): string {
	return samplePeopleMatrix(rows)
		.map((row) => row.join(","))
		.join("\n");
}
