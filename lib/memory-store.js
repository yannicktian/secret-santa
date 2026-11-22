/**
 * The memory double of the store, with the semantics of Redis, expiry included, on a
 * clock that a test can advance.
 * @param {{ now?: () => number }} [options] `now` gives the time in milliseconds.
 * @returns {import("./store.js").Store}
 */
export function createMemoryStore({ now = Date.now } = {}) {
  /** @type {Map<string, { value: string, expiresAt: number }>} */
  const entries = new Map();

  /** @param {string} key */
  function read(key) {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    get: async (key) => read(key)?.value ?? null,
    mget: async (keys) => keys.map((key) => read(key)?.value ?? null),
    setIfAbsent: async (key, value) => {
      if (read(key)) return false;
      entries.set(key, { value, expiresAt: Infinity });
      return true;
    },
    setWithExpiry: async (key, value, seconds) => {
      entries.set(key, { value, expiresAt: now() + seconds * 1000 });
    },
    incr: async (key) => {
      const entry = read(key) ?? { value: "0", expiresAt: Infinity };
      if (!/^-?\d+$/.test(entry.value)) throw new Error("value is not an integer");
      const value = Number(entry.value) + 1;
      entries.set(key, { value: String(value), expiresAt: entry.expiresAt });
      return value;
    },
    del: async (key) => {
      entries.delete(key);
    },
  };
}
