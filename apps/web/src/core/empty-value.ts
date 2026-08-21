// The word a source view draws where a delimited syntax hides an empty field.
//
// It lives in the core rather than beside the rest of the interface copy
// because Markdown's serializer reserves room for it: a column holding an empty
// cell is padded to at least this width, so the placeholder the editor draws
// lands inside the padding the file already has and every row of the table
// stays aligned. That makes the word a fact about the format's output, not only
// a string on screen, and the two cannot be allowed to drift apart. `copy` re-
// exports it, so it is still written once and still read from one place.
//
// Changing it changes the padding of every Markdown table this product writes.
export const EMPTY_VALUE_PLACEHOLDER = "(empty)";
