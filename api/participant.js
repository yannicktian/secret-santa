import { getParticipantState } from "../lib/gift.js";
import { handle, json, readJson } from "../lib/http.js";
import { getStore } from "../lib/store.js";

/** `POST /api/participant`: whether the participant has chosen a password. */
export const POST = handle(async (request) => {
  const body = Object(await readJson(request));
  return json(await getParticipantState(getStore(), body.participant));
});
