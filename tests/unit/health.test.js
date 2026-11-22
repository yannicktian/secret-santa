import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { GET } from "../../api/health.js";

const VARIABLES = [
  "SECRET_SANTA_STORE",
  "VERCEL_ENV",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "ADMIN_PASSWORD",
];

/** @type {Record<string, string | undefined>} */
let saved = {};

beforeEach(() => {
  saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of VARIABLES) delete process.env[name];
});

afterEach(() => {
  for (const name of VARIABLES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

async function health() {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return response.json();
}

test("without variables, store is missing and the reserved page is closed", async () => {
  assert.deepEqual(await health(), { ok: true, store: "missing", reservedPage: false });
});

test("with SECRET_SANTA_STORE=memory, store is memory", async () => {
  process.env.SECRET_SANTA_STORE = "memory";
  assert.equal((await health()).store, "memory");
});

test("on Vercel, SECRET_SANTA_STORE=memory is ignored", async () => {
  process.env.SECRET_SANTA_STORE = "memory";
  process.env.VERCEL_ENV = "preview";
  assert.equal((await health()).store, "missing");
});

test("with KV_REST_API_URL and KV_REST_API_TOKEN, store is redis", async () => {
  process.env.KV_REST_API_URL = "https://fictif.upstash.io";
  process.env.KV_REST_API_TOKEN = "jeton-fictif";
  process.env.VERCEL_ENV = "production";
  assert.equal((await health()).store, "redis");
});

test("with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, store is redis", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://fictif.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "jeton-fictif";
  assert.equal((await health()).store, "redis");
});

test("a Redis address without its token is missing", async () => {
  process.env.KV_REST_API_URL = "https://fictif.upstash.io";
  assert.equal((await health()).store, "missing");
});

test("reservedPage follows the presence of ADMIN_PASSWORD", async () => {
  process.env.ADMIN_PASSWORD = "";
  assert.equal((await health()).reservedPage, false);
  process.env.ADMIN_PASSWORD = "admin-fictif";
  assert.equal((await health()).reservedPage, true);
});

test("the answer contains no value of any variable", async () => {
  /** @type {Record<string, string>} */
  const values = {
    SECRET_SANTA_STORE: "memory",
    KV_REST_API_URL: "https://adresse-temoin.upstash.io",
    KV_REST_API_TOKEN: "jeton-temoin",
    UPSTASH_REDIS_REST_URL: "https://autre-adresse-temoin.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "autre-jeton-temoin",
    ADMIN_PASSWORD: "admin-temoin",
  };
  Object.assign(process.env, values);
  const text = await GET().text();
  for (const [name, value] of Object.entries(values)) {
    if (name === "SECRET_SANTA_STORE") continue;
    assert.ok(!text.includes(value), name);
  }
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["ok", "reservedPage", "store"]);
});
