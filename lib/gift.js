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

/**
 * The draw, made and written once by `SET draw … NX` if it does not exist yet (S7). When
 * two calls make one at the same time, Redis keeps one and both read it back.
 * @param {import("./store.js").Store} store
 * @param {(max: number) => number} [randomInt]
 * @returns {Promise<Record<string, string>>} Giver id to receiver id.
 */
export async function getOrCreateDraw(store, randomInt) {
  const stored = await store.get("draw");
  if (stored !== null) return JSON.parse(stored);
  const draw = makeDraw(
    participants.map((p) => p.id),
    randomInt,
  );
  if (await store.setIfAbsent("draw", JSON.stringify(draw))) return draw;
  return JSON.parse(String(await store.get("draw")));
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
 * Chooses the password of a participant and gives the name drawn (S2, S7, T1). The draw
 * is made before the hash is written. An existing password is never replaced: the same
 * one gives the name, another one counts as a wrong attempt (409 `already_chosen`).
 * @param {import("./store.js").Store} store
 * @param {unknown} participant
 * @param {unknown} password
 * @returns {Promise<{ receiver: string }>}
 */
export async function choosePassword(store, participant, password) {
  const id = participantId(participant);
  const text = passwordText(password);
  if (!isLongEnough(text)) throw new HttpError(422, "too_short");
  const draw = await getOrCreateDraw(store);
  if (await store.setIfAbsent(`password:${id}`, await hashPassword(text))) {
    return receiverOf(draw, id);
  }
  const passwordHash = await store.get(`password:${id}`);
  if (passwordHash === null) return choosePassword(store, id, text);
  const result = await attempt(store, id, () => verifyPassword(text, passwordHash));
  if (result === "wrong_password") throw new HttpError(409, "already_chosen");
  if (result === "locked") throw new HttpError(429, "locked");
  return receiverOf(draw, id);
}

/**
 * Checks the password given again and gives the name drawn (S3), under the rule of the
 * 5 wrong attempts. Without a password (erased meanwhile, T2): 409 `no_password`, no
 * attempt counted. It never makes a draw: a password without a draw is a 500 (S7).
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
  if (draw === null) throw new Error("A password exists without a draw");
  return receiverOf(JSON.parse(draw), id);
}
