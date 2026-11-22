/** Wrong attempts in a row that lock a participant, or the reserved page. */
export const MAX_FAILS = 5;

/** How long a lock lasts, in seconds. */
export const LOCK_SECONDS = 60;

/**
 * One password attempt under the rule of the 5 wrong attempts (S3, S6, D9), for a
 * participant id or `admin`. While `lock:<id>` exists, answers `locked` without calling
 * `check`. A right attempt sets the count back to zero; the fifth wrong one in a row
 * locks for a minute and answers `locked`. An error thrown by `check` passes through
 * and is not counted.
 * @param {import("./store.js").Store} store
 * @param {string} id
 * @param {() => boolean | Promise<boolean>} check Whether the password is right.
 * @returns {Promise<"ok" | "wrong_password" | "locked">}
 */
export async function attempt(store, id, check) {
  if (await store.get(`lock:${id}`)) return "locked";
  if (await check()) {
    await store.del(`fails:${id}`);
    return "ok";
  }
  if ((await store.incr(`fails:${id}`)) < MAX_FAILS) return "wrong_password";
  await store.setWithExpiry(`lock:${id}`, "1", LOCK_SECONDS);
  await store.del(`fails:${id}`);
  return "locked";
}
