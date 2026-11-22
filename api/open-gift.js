import { openGift } from "../lib/gift.js";
import { handle, json, readJson } from "../lib/http.js";
import { getStore } from "../lib/store.js";

/** `POST /api/open-gift`: checks the password given again and gives the name drawn (S3). */
export const POST = handle(async (request) => {
  const body = Object(await readJson(request));
  return json(await openGift(getStore(), body.participant, body.password));
});
