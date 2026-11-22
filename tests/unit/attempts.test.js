import assert from "node:assert/strict";
import { test } from "node:test";
import { attempt } from "../../lib/attempts.js";
import { createMemoryStore } from "../../lib/memory-store.js";

/**
 * A memory store with a clock the test advances, and the list of its writes.
 */
function setup() {
  const clock = { now: 0 };
  const inner = createMemoryStore({ now: () => clock.now });
  /** @type {unknown[][]} */
  const writes = [];
  /** @type {import("../../lib/store.js").Store} */
  const store = {
    get: (key) => inner.get(key),
    mget: (keys) => inner.mget(keys),
    setIfAbsent: (key, value) => {
      writes.push(["setIfAbsent", key, value]);
      return inner.setIfAbsent(key, value);
    },
    setWithExpiry: (key, value, seconds) => {
      writes.push(["setWithExpiry", key, value, seconds]);
      return inner.setWithExpiry(key, value, seconds);
    },
    incr: (key) => {
      writes.push(["incr", key]);
      return inner.incr(key);
    },
    del: (key) => {
      writes.push(["del", key]);
      return inner.del(key);
    },
  };
  return { clock, store, writes };
}

const right = () => true;
const wrong = () => false;

/**
 * Makes `count` wrong attempts and returns their answers.
 * @param {import("../../lib/store.js").Store} store
 * @param {string} id
 * @param {number} count
 */
async function fail(store, id, count) {
  const answers = [];
  for (let i = 0; i < count; i++) answers.push(await attempt(store, id, wrong));
  return answers;
}

test("a right attempt answers ok", async () => {
  const { store } = setup();
  assert.equal(await attempt(store, "lea", right), "ok");
});

test("4 wrong attempts then a right one set the count back to zero", async () => {
  const { store } = setup();
  assert.deepEqual(await fail(store, "lea", 4), Array(4).fill("wrong_password"));
  assert.equal(await attempt(store, "lea", right), "ok");
  assert.equal(await store.get("fails:lea"), null);
  assert.deepEqual(await fail(store, "lea", 5), [...Array(4).fill("wrong_password"), "locked"]);
});

test("the fifth wrong attempt in a row locks for a minute and answers locked", async () => {
  const { store } = setup();
  assert.deepEqual(await fail(store, "lea", 5), [...Array(4).fill("wrong_password"), "locked"]);
  assert.equal(await store.get("lock:lea"), "1");
  assert.equal(await store.get("fails:lea"), null);
});

test("during the minute, every attempt answers locked without checking", async () => {
  const { clock, store } = setup();
  await fail(store, "lea", 5);
  let checked = 0;
  const check = () => {
    checked++;
    return true;
  };
  assert.equal(await attempt(store, "lea", check), "locked");
  clock.now += 59_999;
  assert.equal(await attempt(store, "lea", check), "locked");
  assert.equal(await attempt(store, "lea", wrong), "locked");
  assert.equal(checked, 0);
});

test("60 seconds later, the right password opens and 5 new attempts are given", async () => {
  const { clock, store } = setup();
  await fail(store, "lea", 5);
  clock.now += 60_000;
  assert.equal(await attempt(store, "lea", right), "ok");
  await fail(store, "lea", 5);
  clock.now += 60_000;
  assert.deepEqual(await fail(store, "lea", 5), [...Array(4).fill("wrong_password"), "locked"]);
});

test("two participants do not lock each other", async () => {
  const { store } = setup();
  await fail(store, "lea", 5);
  assert.deepEqual(await fail(store, "yannick", 4), Array(4).fill("wrong_password"));
  assert.equal(await attempt(store, "yannick", right), "ok");
  assert.equal(await attempt(store, "lea", right), "locked");
});

test("admin has its own counter", async () => {
  const { store } = setup();
  await fail(store, "lea", 4);
  await fail(store, "admin", 4);
  assert.equal(await attempt(store, "admin", wrong), "locked");
  assert.equal(await attempt(store, "lea", right), "ok");
  assert.equal(await attempt(store, "admin", right), "locked");
});

test("an error thrown by the check passes through, the attempt counted", async () => {
  const { store } = setup();
  await fail(store, "lea", 3);
  const broken = () => {
    throw new Error("broken check");
  };
  await assert.rejects(attempt(store, "lea", broken), /broken check/);
  assert.equal(await store.get("fails:lea"), "4");
});

test("100 attempts at the same time get at most 5 checks", async () => {
  const { store } = setup();
  let checked = 0;
  const slowWrong = async () => {
    checked++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return false;
  };
  const answers = await Promise.all(
    Array.from({ length: 100 }, () => attempt(store, "lea", slowWrong)),
  );
  assert.equal(checked, 5);
  assert.equal(answers.filter((answer) => answer === "wrong_password").length, 4);
  assert.equal(await store.get("lock:lea"), "1");
  assert.equal(await attempt(store, "lea", right), "locked");
});

test("attempts sent one after the other during slow checks get at most 5 checks", async () => {
  const { store } = setup();
  let checked = 0;
  const slowWrong = async () => {
    checked++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return false;
  };
  const pending = [];
  for (let i = 0; i < 50; i++) {
    pending.push(attempt(store, "lea", slowWrong));
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  await Promise.all(pending);
  assert.equal(checked, 5);
});

test("attempts counted after a lock reset the count get no check", async () => {
  const inner = createMemoryStore();
  let incrs = 0;
  /** @type {import("../../lib/store.js").Store} */
  const store = {
    ...inner,
    incr: async (key) => {
      if (++incrs > 6) await new Promise((resolve) => setTimeout(resolve, 5));
      return inner.incr(key);
    },
  };
  let checked = 0;
  const slowWrong = async () => {
    checked++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return false;
  };
  await Promise.all(Array.from({ length: 12 }, () => attempt(store, "lea", slowWrong)));
  assert.equal(checked, 5);
});

test("a right password on the fifth attempt opens and removes the lock", async () => {
  const { store } = setup();
  await fail(store, "lea", 4);
  assert.equal(await attempt(store, "lea", right), "ok");
  assert.equal(await store.get("lock:lea"), null);
  assert.equal(await store.get("fails:lea"), null);
});

test("a count left past the fifth without a lock locks one minute, not forever", async () => {
  const { clock, store } = setup();
  for (let i = 0; i < 5; i++) await store.incr("fails:lea");
  assert.equal(await attempt(store, "lea", right), "locked");
  clock.now += 60_000;
  assert.equal(await attempt(store, "lea", right), "ok");
});

test("a stop after the lock of the fifth attempt locks two minutes at most", async () => {
  const { clock, store } = setup();
  for (let i = 0; i < 5; i++) await store.incr("fails:lea");
  await store.setWithExpiry("lock:lea", "1", 60);
  clock.now += 60_000;
  assert.equal(await attempt(store, "lea", right), "locked");
  clock.now += 60_000;
  assert.equal(await attempt(store, "lea", right), "ok");
});

test("the check may be asynchronous", async () => {
  const { store } = setup();
  assert.equal(await attempt(store, "lea", async () => true), "ok");
  assert.equal(await attempt(store, "lea", async () => false), "wrong_password");
});

test("only fails:<id> and lock:<id> are written, by the commands of the architecture", async () => {
  const { clock, store, writes } = setup();
  await fail(store, "lea", 4);
  await attempt(store, "lea", right);
  await fail(store, "admin", 6);
  clock.now += 60_000;
  await attempt(store, "admin", right);
  for (const [operation, key, ...rest] of writes) {
    const allowed =
      (operation === "incr" && /^fails:(lea|admin)$/.test(String(key))) ||
      (operation === "del" && /^(fails|lock):(lea|admin)$/.test(String(key))) ||
      (operation === "setWithExpiry" &&
        /^lock:(lea|admin)$/.test(String(key)) &&
        rest[0] === "1" &&
        rest[1] === 60);
    assert.ok(allowed, JSON.stringify([operation, key, ...rest]));
  }
  assert.ok(writes.some(([operation]) => operation === "setWithExpiry"));
});
