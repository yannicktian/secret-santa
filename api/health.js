import { json } from "../lib/http.js";
import { storeKind } from "../lib/store.js";

/** `GET /api/health`: the health of the deployment, without reading any data. */
export function GET() {
  return json({
    ok: true,
    store: storeKind(process.env),
    reservedPage: Boolean(process.env.ADMIN_PASSWORD),
  });
}
