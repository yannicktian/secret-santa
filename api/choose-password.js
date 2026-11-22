import { choosePassword } from "../lib/gift.js";
import { handle, json, readJson } from "../lib/http.js";
import { getStore } from "../lib/store.js";

/** `POST /api/choose-password`: chooses the password and gives the name drawn (S2, S7). */
export const POST = handle(async (request) => {
  const body = Object(await readJson(request));
  return json(await choosePassword(getStore(), body.participant, body.password));
});
