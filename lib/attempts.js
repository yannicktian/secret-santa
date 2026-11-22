/** Wrong attempts in a row that lock a participant, or the reserved page. */
export const MAX_FAILS = 5;

/** How long a lock lasts, in seconds. */
export const LOCK_SECONDS = 60;

/**
 * One password attempt under the rule of the 5 wrong attempts (S3, S6, D9), for a
 * participant id or `admin`.
 *
 * The attempt is counted by an atomic `INCR` before `check` runs, and the lock is read
 * again after the count, so that attempts sent at the same time never get more than 5
 * checks: past the fifth, or while `lock:<id>` exists, the answer is `locked` without
 * calling `check`. The fifth attempt writes the
 * lock before its check, and removes it if the password is right. A right attempt sets
 * the count back to zero. A count past the fifth without a lock, left by a function
 * stopped between two commands, locks for a minute and starts again from zero.
 *
 * `check` must not throw for an expected answer (such as no password chosen): the caller
 * settles it before. An error thrown by `check` passes through, the attempt counted.
 * @param {import("./store.js").Store} store
 * @param {string} id
 * @param {() => boolean | Promise<boolean>} check Whether the password is right.
 * @returns {Promise<"ok" | "wrong_password" | "locked">}
 */
export async function attempt(store, id, check) {
  const lock = `lock:${id}`;
  const fails = `fails:${id}`;
  if (await store.get(lock)) return "locked";
  const count = await store.incr(fails);
  if (count > MAX_FAILS) {
    await store.setWithExpiry(lock, "1", LOCK_SECONDS);
    await store.del(fails);
    return "locked";
  }
  if (await store.get(lock)) {
    await store.del(fails);
    return "locked";
  }
  if (count === MAX_FAILS) await store.setWithExpiry(lock, "1", LOCK_SECONDS);
  if (await check()) {
    await store.del(fails);
    if (count === MAX_FAILS) await store.del(lock);
    return "ok";
  }
  if (count < MAX_FAILS) return "wrong_password";
  await store.del(fails);
  return "locked";
}

/**
 * Erases the count of wrong attempts, then the lock, of a participant id or `admin`, so
 * that the next attempt starts again with its 5 attempts.
 * @param {import("./store.js").Store} store
 * @param {string} id
 */
export async function clearAttempts(store, id) {
  await store.del(`fails:${id}`);
  await store.del(`lock:${id}`);
}
