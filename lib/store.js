import { Redis } from "@upstash/redis";
import { createMemoryStore } from "./memory-store.js";

/**
 * The storage the domain rules receive. Every value is a string.
 * @typedef {object} Store
 * @property {(key: string) => Promise<string | null>} get
 * @property {(keys: string[]) => Promise<(string | null)[]>} mget
 * @property {(key: string, value: string) => Promise<boolean>} setIfAbsent
 *   `SET … NX`: true if written.
 * @property {(key: string, value: string, seconds: number) => Promise<void>} setWithExpiry
 *   `SET … EX seconds`.
 * @property {(key: string) => Promise<number>} incr
 * @property {(key: string) => Promise<void>} del
 */

/**
 * Which store `getStore` uses in an environment.
 * @param {NodeJS.ProcessEnv} env
 * @returns {"redis" | "memory" | "missing"}
 */
export function storeKind(env) {
  if (env.SECRET_SANTA_STORE === "memory" && !env.VERCEL_ENV) return "memory";
  const kv = env.KV_REST_API_URL && env.KV_REST_API_TOKEN;
  const upstash = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN;
  return kv || upstash ? "redis" : "missing";
}

/**
 * The store on an Upstash Redis client created with `automaticDeserialization: false`.
 * @param {Redis} redis
 * @returns {Store}
 */
export function createRedisStore(redis) {
  return {
    get: (key) => redis.get(key),
    mget: async (keys) => (keys.length ? redis.mget(...keys) : []),
    setIfAbsent: async (key, value) => (await redis.set(key, value, { nx: true })) === "OK",
    setWithExpiry: async (key, value, seconds) => {
      await redis.set(key, value, { ex: seconds });
    },
    incr: (key) => redis.incr(key),
    del: async (key) => {
      await redis.del(key);
    },
  };
}

/** @type {Store | undefined} */
let memoryStore;

/**
 * The store of the environment: the memory store, one per process, with
 * `SECRET_SANTA_STORE=memory` off Vercel; otherwise Redis from the variables of the
 * Upstash integration. Throws when neither is available, never falling back to memory.
 * @returns {Store}
 */
export function getStore() {
  const kind = storeKind(process.env);
  if (kind === "memory") {
    memoryStore ??= createMemoryStore();
    return memoryStore;
  }
  if (kind === "missing") throw new Error("No store: the Redis variables are missing");
  return createRedisStore(
    Redis.fromEnv({ automaticDeserialization: false, enableAutoPipelining: false }),
  );
}
