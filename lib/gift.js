import { attempt } from "./attempts.js";
import { makeDraw } from "./draw.js";
import { HttpError } from "./http.js";
import { participants } from "./participants.js";
import { hashPassword, isLongEnough, verifyPassword } from "./password.js";

/**
 * The id of a known participant, or a 400 `unknown_participant`.
 * @param {unknown} id
 */
function participantId(id) {
  const participant = participants.find((p) => p.id === id);
  if (!participant) throw new HttpError(400, "unknown_participant");
  return participant.id;
}

/**
 * The password if it is text, or a 400 `invalid_password`.
 * @param {unknown} password
 */
function passwordText(password) {
  if (typeof password !== "string") throw new HttpError(400, "invalid_password");
  return password;
}

/** How many times a choice is made again when a redraw changes the draw during it (S8). */
const CHOICE_TRIES = 3;

/**
 * The draw as stored, made and written once by `SET draw … NX` if it does not exist yet
 * (S7). When two calls make one at the same time, Redis keeps one and both read it back.
 * @param {import("./store.js").Store} store
 * @param {(max: number) => number} [randomInt]
 * @returns {Promise<string>} The JSON of the draw.
 */
async function getOrCreateDrawText(store, randomInt) {
  const stored = await store.get("draw");
  if (stored !== null) return stored;
  const draw = JSON.stringify(
    makeDraw(
      participants.map((p) => p.id),
      randomInt,
    ),
  );
  if (await store.setIfAbsent("draw", draw)) return draw;
  return String(await store.get("draw"));
}

/**
 * The draw, made and written once if it does not exist yet (S7).
 * @param {import("./store.js").Store} store
 * @param {(max: number) => number} [randomInt]
 * @returns {Promise<Record<string, string>>} Giver id to receiver id.
 */
export async function getOrCreateDraw(store, randomInt) {
  return JSON.parse(await getOrCreateDrawText(store, randomInt));
}

/**
 * The answer that gives a participant the name drawn, and nothing else.
 * @param {Record<string, string>} draw
 * @param {string} id
 */
function receiverOf(draw, id) {
  const receiver = participants.find((p) => p.id === draw[id]);
  if (!receiver) throw new Error("The draw has no receiver for this participant");
  return { receiver: receiver.name };
}

/**
 * Whether a participant has chosen a password.
 * @param {import("./store.js").Store} store
 * @param {unknown} participant
 */
export async function getParticipantState(store, participant) {
  const id = participantId(participant);
  return { hasPassword: (await store.get(`password:${id}`)) !== null };
}

/**
 * Whether each participant has chosen a password, by id, in the order of the scope: the
 * home page reads it as it opens (S1). Reads only `password:<id>`, never the draw.
 * @param {import("./store.js").Store} store
 * @returns {Promise<{ hasPassword: Record<string, boolean> }>}
 */
export async function getParticipantStates(store) {
  const hashes = await store.mget(participants.map(({ id }) => `password:${id}`));
  return {
    hasPassword: Object.fromEntries(participants.map(({ id }, i) => [id, hashes[i] !== null])),
  };
}

/**
 * Chooses the password of a participant and gives the name drawn (S2, S7, T1). The draw
 * is made before the hash is written. An existing password is never replaced: the same
 * one gives the name, another one counts as a wrong attempt (409 `already_chosen`).
 *
 * The draw is read again once the password is written or checked (S8): unchanged, a redraw
 * that erases it later also erases this password; changed, a redraw came in between, and
 * the choice is made again on the new draw.
 * @param {import("./store.js").Store} store
 * @param {unknown} participant
 * @param {unknown} password
 * @returns {Promise<{ receiver: string }>}
 */
export async function choosePassword(store, participant, password) {
  const id = participantId(participant);
  const text = passwordText(password);
  if (!isLongEnough(text)) throw new HttpError(422, "too_short");
  const passwordHash = await hashPassword(text);
  for (let tries = 0; tries < CHOICE_TRIES; tries++) {
    const draw = await getOrCreateDrawText(store);
    if (!(await store.setIfAbsent(`password:${id}`, passwordHash))) {
      const stored = await store.get(`password:${id}`);
      // Erased in between: the choice is made again.
      if (stored === null) continue;
      const result = await attempt(store, id, () => verifyPassword(text, stored));
      if (result === "wrong_password") throw new HttpError(409, "already_chosen");
      if (result === "locked") throw new HttpError(429, "locked");
    }
    if ((await store.get("draw")) === draw) return receiverOf(JSON.parse(draw), id);
  }
  throw new Error("The draw changed during each try");
}

/**
 * Checks the password given again and gives the name drawn (S3), under the rule of the
 * 5 wrong attempts. Without a password (erased meanwhile, T2): 409 `no_password`, no
 * attempt counted. It never makes a draw (S7). The draw is read after the check: a redraw
 * that erases it later also erases this password (S8); without a draw, the password is
 * being erased by a redraw, or was left by a redraw stopped in between: 409 `no_password`.
 * @param {import("./store.js").Store} store
 * @param {unknown} participant
 * @param {unknown} password
 * @returns {Promise<{ receiver: string }>}
 */
export async function openGift(store, participant, password) {
  const id = participantId(participant);
  const text = passwordText(password);
  const passwordHash = await store.get(`password:${id}`);
  if (passwordHash === null) throw new HttpError(409, "no_password");
  const result = await attempt(store, id, () => verifyPassword(text, passwordHash));
  if (result === "wrong_password") throw new HttpError(401, "wrong_password");
  if (result === "locked") throw new HttpError(429, "locked");
  const draw = await store.get("draw");
  if (draw === null) throw new HttpError(409, "no_password");
  return receiverOf(JSON.parse(draw), id);
}
