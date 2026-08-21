// A column's positional name, in the spreadsheet sequence A..Z, AA, AB, and so
// on. This is the only identity an unnamed column has, so it is what the index
// strip displays, what an empty header announces, and what the JSON codec keys
// an unnamed column by. One implementation, because two would eventually
// disagree about what column 27 is called.
export function columnLetter(index: number): string {
	let value = index + 1;
	let result = "";
	while (value > 0) {
		value -= 1;
		result = String.fromCharCode(65 + (value % 26)) + result;
		value = Math.floor(value / 26);
	}
	return result;
}
