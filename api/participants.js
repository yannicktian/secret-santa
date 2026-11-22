import { getParticipantStates } from "../lib/gift.js";
import { handle, json, readJson } from "../lib/http.js";
import { getStore } from "../lib/store.js";

/** `POST /api/participants`: whether each participant has chosen a password (S1). */
export const POST = handle(async (request) => {
  await readJson(request);
  return json(await getParticipantStates(getStore()));
});
