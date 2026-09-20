// Erasing everything Tabelo stored, from the interface (owner, 2026-09-20).
//
// It removes every key this origin holds under the product's prefix: the
// library index, each table, the preferences, and the recovery copies of
// both. Prefix rather than a list, so a key added later cannot be left
// behind, and a key another site or extension put there is never touched.
// Nothing else on the origin is cleared, so a caller cannot use this to reach
// data the product does not own.
const KEY_PREFIX = "tabelo.";

export function eraseStoredData(): boolean {
	try {
		const keys: string[] = [];
		for (let index = 0; index < window.localStorage.length; index += 1) {
			const key = window.localStorage.key(index);
			if (key?.startsWith(KEY_PREFIX)) keys.push(key);
		}
		for (const key of keys) window.localStorage.removeItem(key);
		return true;
	} catch {
		// Blocked or private storage: there was nothing durable to erase.
		return false;
	}
}
