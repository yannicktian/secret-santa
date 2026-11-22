import { json } from "../lib/http.js";

/**
 * Which store the functions would use, from the presence of the variables only.
 * @param {NodeJS.ProcessEnv} env
 * @returns {"redis" | "memory" | "missing"}
 */
function storeKind(env) {
  if (env.SECRET_SANTA_STORE === "memory" && !env.VERCEL_ENV) return "memory";
  const kv = env.KV_REST_API_URL && env.KV_REST_API_TOKEN;
  const upstash = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN;
  return kv || upstash ? "redis" : "missing";
}

/** `GET /api/health`: the health of the deployment, without reading any data. */
export function GET() {
  return json({
    ok: true,
    store: storeKind(process.env),
    reservedPage: Boolean(process.env.ADMIN_PASSWORD),
  });
}
