import { handle, readJson } from "../lib/http.js";
import { answerReserved } from "../lib/reserved.js";
import { getStore } from "../lib/store.js";

/** `POST /api/reserved`: the reserved page, list of the states and erasing (S6). */
export const POST = handle(async (request) => {
  const body = await readJson(request);
  return answerReserved(getStore(), body, process.env.ADMIN_PASSWORD);
});
