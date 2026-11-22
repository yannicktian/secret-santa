import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { Redis } from "@upstash/redis";
import { createMemoryStore } from "../../lib/memory-store.js";
import { createRedisStore, getStore } from "../../lib/store.js";

const FAKE_URL = "https://fictif.upstash.io";
const FAKE_TOKEN = "jeton-fictif";

/**
 * A fake Upstash REST endpoint, put in place of `fetch`: it runs the commands it receives
 * on a map, the way Redis would, and records them.
 */
function fakeRedis() {
  /** @type {Map<string, string>} */
  const data = new Map();
  /** @type {{ url: string, authorization: string | null, command: unknown[] }[]} */
  const requests = [];

  /** @param {unknown[]} command */
  function run([name, ...args]) {
    const keys = args.map(String);
    switch (String(name).toLowerCase()) {
      case "get":
        return data.get(keys[0]) ?? null;
      case "mget":
        return keys.map((key) => data.get(key) ?? null);
      case "set": {
        const options = keys.slice(2).map((option) => option.toLowerCase());
        if (options.includes("nx") && data.has(keys[0])) return null;
        data.set(keys[0], keys[1]);
        return "OK";
      }
      case "incr": {
        const value = Number(data.get(keys[0]) ?? 0) + 1;
        data.set(keys[0], String(value));
        return value;
      }
      case "del":
        return keys.filter((key) => data.delete(key)).length;
      default:
        throw new Error(`unexpected command ${String(name)}`);
    }
  }

  /**
   * @param {string | URL | Request} url
   * @param {RequestInit} [init]
   */
  async function fetch(url, init) {
    const command = JSON.parse(String(init?.body));
    requests.push({
      url: String(url),
      authorization: new Headers(init?.headers).get("authorization"),
      command,
    });
    return Response.json({ result: run(command) });
  }

  return { fetch, requests };
}

/** @type {ReturnType<typeof fakeRedis>} */
let redis;

beforeEach(() => {
  redis = fakeRedis();
  mock.method(globalThis, "fetch", redis.fetch);
});

afterEach(() => {
  mock.restoreAll();
});

function redisStore() {
  return createRedisStore(
    new Redis({
      url: FAKE_URL,
      token: FAKE_TOKEN,
      automaticDeserialization: false,
      enableAutoPipelining: false,
    }),
  );
}

/** The same contract, on the memory store and on the Redis store. */
/** @type {[string, () => import("../../lib/store.js").Store][]} */
const stores = [
  ["memory store", () => createMemoryStore()],
  ["Redis store", redisStore],
];
for (const [name, make] of stores) {
  describe(`${name} contract`, () => {
    test("get gives null for a missing key, the string otherwise", async () => {
      const store = make();
      assert.equal(await store.get("draw"), null);
      await store.setIfAbsent("draw", '{"yannick":"lea"}');
      assert.equal(await store.get("draw"), '{"yannick":"lea"}');
    });

    test("setIfAbsent writes only once", async () => {
      const store = make();
      assert.equal(await store.setIfAbsent("password:lea", "premiere"), true);
      assert.equal(await store.setIfAbsent("password:lea", "seconde"), false);
      assert.equal(await store.get("password:lea"), "premiere");
    });

    test("mget gives the values in the order of the keys", async () => {
      const store = make();
      await store.setIfAbsent("password:yannick", "a");
      await store.setIfAbsent("password:anne", "b");
      assert.deepEqual(await store.mget(["password:anne", "password:lea", "password:yannick"]), [
        "b",
        null,
        "a",
      ]);
    });

    test("mget of no key gives an empty list", async () => {
      assert.deepEqual(await make().mget([]), []);
    });

    test("incr counts from 1 and keeps the count as a string", async () => {
      const store = make();
      assert.equal(await store.incr("fails:lea"), 1);
      assert.equal(await store.incr("fails:lea"), 2);
      assert.equal(await store.get("fails:lea"), "2");
    });

    test("setWithExpiry writes the value", async () => {
      const store = make();
      await store.setWithExpiry("lock:lea", "1", 60);
      assert.equal(await store.get("lock:lea"), "1");
    });

    test("del removes a key, and a missing key is no error", async () => {
      const store = make();
      await store.setIfAbsent("password:lea", "x");
      await store.del("password:lea");
      await store.del("password:lea");
      assert.equal(await store.get("password:lea"), null);
      assert.equal(await store.setIfAbsent("password:lea", "y"), true);
    });
  });
}

describe("Redis store commands", () => {
  test("each operation sends its command, one request each, to the base address", async () => {
    const store = redisStore();
    await store.setIfAbsent("draw", "{}");
    await store.setWithExpiry("lock:lea", "1", 60);
    await store.incr("fails:lea");
    await store.mget(["password:yannick", "password:lea"]);
    await store.get("draw");
    await store.del("fails:lea");
    assert.deepEqual(
      redis.requests.map((request) => request.command),
      [
        ["set", "draw", "{}", "nx"],
        ["set", "lock:lea", "1", "ex", 60],
        ["incr", "fails:lea"],
        ["mget", "password:yannick", "password:lea"],
        ["get", "draw"],
        ["del", "fails:lea"],
      ],
    );
    for (const request of redis.requests) {
      assert.equal(request.url, FAKE_URL);
      assert.equal(request.authorization, `Bearer ${FAKE_TOKEN}`);
    }
  });

  test("mget of no key sends nothing, since Redis refuses it", async () => {
    await redisStore().mget([]);
    assert.equal(redis.requests.length, 0);
  });

  test("a value that looks like JSON comes back as the same string", async () => {
    const store = redisStore();
    await store.setIfAbsent("draw", '{"yannick":"lea"}');
    await store.incr("fails:lea");
    assert.equal(await store.get("draw"), '{"yannick":"lea"}');
    assert.equal(await store.get("fails:lea"), "1");
  });
});

describe("memory store expiry", () => {
  test("a key written for 60 seconds is gone after 60 seconds of clock", async () => {
    let now = 1_000_000;
    const store = createMemoryStore({ now: () => now });
    await store.setWithExpiry("lock:lea", "1", 60);
    now += 59_999;
    assert.equal(await store.get("lock:lea"), "1");
    assert.deepEqual(await store.mget(["lock:lea"]), ["1"]);
    now += 1;
    assert.equal(await store.get("lock:lea"), null);
    assert.deepEqual(await store.mget(["lock:lea"]), [null]);
    assert.equal(await store.setIfAbsent("lock:lea", "2"), true);
  });

  test("an expired counter starts again from 1", async () => {
    let now = 0;
    const store = createMemoryStore({ now: () => now });
    await store.setWithExpiry("fails:lea", "4", 60);
    now += 60_000;
    assert.equal(await store.incr("fails:lea"), 1);
  });

  test("a value written without expiry stays", async () => {
    let now = 0;
    const store = createMemoryStore({ now: () => now });
    await store.setIfAbsent("draw", "{}");
    now += 365 * 24 * 3600 * 1000;
    assert.equal(await store.get("draw"), "{}");
  });
});

describe("getStore", () => {
  const VARIABLES = [
    "SECRET_SANTA_STORE",
    "VERCEL_ENV",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  /** @type {Record<string, string | undefined>} */
  let saved = {};

  beforeEach(() => {
    saved = Object.fromEntries(VARIABLES.map((variable) => [variable, process.env[variable]]));
    for (const variable of VARIABLES) delete process.env[variable];
  });

  afterEach(() => {
    for (const variable of VARIABLES) {
      if (saved[variable] === undefined) delete process.env[variable];
      else process.env[variable] = saved[variable];
    }
  });

  test("SECRET_SANTA_STORE=memory off Vercel gives one memory store for the process", async () => {
    process.env.SECRET_SANTA_STORE = "memory";
    await getStore().setWithExpiry("fails:anne", "3", 60);
    assert.equal(await getStore().get("fails:anne"), "3");
    await getStore().del("fails:anne");
    assert.equal(redis.requests.length, 0);
  });

  test("on Vercel, SECRET_SANTA_STORE=memory is refused", () => {
    process.env.SECRET_SANTA_STORE = "memory";
    process.env.VERCEL_ENV = "preview";
    assert.throws(() => getStore());
  });

  test("on Vercel with SECRET_SANTA_STORE=memory and Redis variables, Redis is used", async () => {
    process.env.SECRET_SANTA_STORE = "memory";
    process.env.VERCEL_ENV = "production";
    process.env.KV_REST_API_URL = FAKE_URL;
    process.env.KV_REST_API_TOKEN = FAKE_TOKEN;
    assert.equal(await getStore().get("fails:anne"), null);
    assert.equal(redis.requests.length, 1);
  });

  test("the Redis client uses KV_REST_API_URL and KV_REST_API_TOKEN alone", async () => {
    process.env.KV_REST_API_URL = FAKE_URL;
    process.env.KV_REST_API_TOKEN = FAKE_TOKEN;
    await getStore().setIfAbsent("draw", '{"lea":"anne"}');
    assert.equal(await getStore().get("draw"), '{"lea":"anne"}');
    assert.deepEqual(redis.requests[0], {
      url: FAKE_URL,
      authorization: `Bearer ${FAKE_TOKEN}`,
      command: ["set", "draw", '{"lea":"anne"}', "nx"],
    });
  });

  test("without Redis variables, getStore throws", () => {
    assert.throws(() => getStore());
    process.env.KV_REST_API_URL = FAKE_URL;
    assert.throws(() => getStore());
    assert.equal(redis.requests.length, 0);
  });
});
