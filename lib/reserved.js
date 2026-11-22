import { createHash, timingSafeEqual } from "node:crypto";
import { attempt, clearAttempts } from "./attempts.js";
import { getParticipantStates } from "./gift.js";
import { fail, json } from "./http.js";
import { findParticipant, participants } from "./participants.js";

/** The id under which the rule of the 5 wrong attempts counts the reserved page. */
const ADMIN_ID = "admin";

/** @param {string} text */
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest();

/**
 * One attempt at the admin password, under the rule of the 5 wrong attempts with the id
 * `admin`. The password is compared as is, without normalization (T4), in constant time:
 * the SHA-256 hashes of both are compared by `timingSafeEqual`. Anything but a string is
 * a wrong attempt.
 * @param {import("./store.js").Store} store
 * @param {unknown} password
 * @param {string} adminPassword The value of `ADMIN_PASSWORD`, not empty.
 * @returns {Promise<"ok" | "wrong_password" | "locked">}
 */
export function checkAdminPassword(store, password, adminPassword) {
  return attempt(
    store,
    ADMIN_ID,
    () => typeof password === "string" && timingSafeEqual(sha256(password), sha256(adminPassword)),
  );
}

/**
 * The participants in the order of the scope, each with whether a password is chosen.
 * Reads only `password:<id>`: never the draw, never a hash in the answer.
 * @param {import("./store.js").Store} store
 * @returns {Promise<{ id: string, name: string, hasPassword: boolean }[]>}
 */
export async function listParticipants(store) {
  const { hasPassword } = await getParticipantStates(store);
  return participants.map(({ id, name }) => ({ id, name, hasPassword: hasPassword[id] }));
}

/**
 * Erases the password of a participant, with its count of wrong attempts and its lock,
 * so that the new password has its 5 attempts. The draw does not change.
 * @param {import("./store.js").Store} store
 * @param {string} id
 */
export async function erasePassword(store, id) {
  await clearAttempts(store, id);
  // The password last: a call stopped in between leaves it, and erasing again ends the work.
  await store.del(`password:${id}`);
}

/**
 * Redoes the draw (S8): erases the draw, then the password of each participant with its
 * count and its lock. The new draw is made at the next choice of a password (S7).
 *
 * The draw is erased first, so that every password is erased after it: a choice or an
 * open-gift that reads the draw before the erasing has its password erased afterwards, and
 * one that reads it after sees the new draw or none (`lib/gift.js`). A call stopped in
 * between leaves passwords without a draw, which open-gift treats as no password; redoing
 * the draw again ends the work.
 * @param {import("./store.js").Store} store
 */
export async function redraw(store) {
  await store.del("draw");
  for (const { id } of participants) await erasePassword(store, id);
}

/**
 * The answer of `POST /api/reserved` to a JSON body (S6): 503 `admin_password_missing`
 * when `ADMIN_PASSWORD` is missing or empty; 400 `unknown_action` or
 * `unknown_participant`, without counting an attempt; then the admin password, 401
 * `wrong_password` or 429 `locked`; then the action (`list`, `erase` or `redraw`),
 * answered by the list.
 * @param {import("./store.js").Store} store
 * @param {unknown} body
 * @param {string | undefined} adminPassword The value of `ADMIN_PASSWORD`.
 * @returns {Promise<Response>}
 */
export async function answerReserved(store, body, adminPassword) {
  if (!adminPassword) return fail(503, "admin_password_missing");
  const { password, action, participant } =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? /** @type {Record<string, unknown>} */ (body)
      : {};
  if (action !== "list" && action !== "erase" && action !== "redraw") {
    return fail(400, "unknown_action");
  }
  if (action === "erase" && !findParticipant(participant)) {
    return fail(400, "unknown_participant");
  }
  const result = await checkAdminPassword(store, password, adminPassword);
  if (result === "locked") return fail(429, "locked");
  if (result === "wrong_password") return fail(401, "wrong_password");
  if (action === "erase") await erasePassword(store, /** @type {string} */ (participant));
  if (action === "redraw") await redraw(store);
  return json({ participants: await listParticipants(store) });
}
