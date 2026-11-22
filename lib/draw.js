import crypto from "node:crypto";

/**
 * A draw: each participant id gives to another one, its receiver, and each id receives
 * from exactly one other (S7). Every such draw has the same chance, reciprocal pairs
 * included (D8): a Fisher-Yates shuffle, started again while someone draws himself.
 * @param {readonly string[]} ids
 * @param {(max: number) => number} [randomInt] An integer in [0, max).
 * @returns {Record<string, string>} Giver id to receiver id.
 */
export function makeDraw(ids, randomInt = crypto.randomInt) {
  if (ids.length < 2) throw new RangeError("A draw needs at least two participants");
  const receivers = [...ids];
  do {
    for (let i = receivers.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
    }
  } while (receivers.some((receiver, index) => receiver === ids[index]));
  return Object.fromEntries(ids.map((id, index) => [id, receivers[index]]));
}
