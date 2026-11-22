// Redoing the draw (S8): the action `redraw` of the reserved page, and its race with a
// participant who chooses or gives again his password, forced on the memory store.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choosePassword, openGift } from "../../lib/gift.js";
import { HttpError } from "../../lib/http.js";
import { createMemoryStore } from "../../lib/memory-store.js";
import { participants } from "../../lib/participants.js";
import { hashPassword } from "../../lib/password.js";
import { answerReserved, redraw } from "../../lib/reserved.js";

/** @typedef {import("../../lib/store.js").Store} Store */

const ADMIN = "Admin-Fictif-Refait 7";

/** A fictitious draw, a single cycle. */
const OLD_DRAW = JSON.stringify({
  yannick: "lea",
  lea: "christine",
  christine: "guigui",
  guigui: "mamet",
  mamet: "anne",
  anne: "loulou",
  loulou: "yannick",
});

/** @param {string} id */
const nameOf = (id) => participants.find((p) => p.id === id)?.name;

/**
 * Calls the reserved page's rule and returns its status and JSON body.
 * @param {Store} store
 * @param {unknown} body
 */
async function call(store, body) {
  const response = await answerReserved(store, body, ADMIN);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return { status: response.status, body: await response.json() };
}

/** A memory store with the fictitious draw, Léa's and Anne's passwords, counts and a lock. */
async function chosen() {
  const store = createMemoryStore();
  await store.setIfAbsent("draw", OLD_DRAW);
  await store.setIfAbsent("password:lea", await hashPassword("sapin"));
  await store.setIfAbsent("password:anne", await hashPassword("etoile"));
  await store.incr("fails:anne");
  await store.setWithExpiry("lock:lea", "1", 60);
  return store;
}

test("redraw erases the draw, every password, count and lock, and answers the list", async () => {
  const store = await chosen();
  const { status, body } = await call(store, { password: ADMIN, action: "redraw" });
  assert.equal(status, 200);
  assert.deepEqual(body, {
    participants: participants.map(({ id, name }) => ({ id, name, hasPassword: false })),
  });
  assert.equal(await store.get("draw"), null);
  for (const { id } of participants) {
    for (const key of [`password:${id}`, `fails:${id}`, `lock:${id}`]) {
      assert.equal(await store.get(key), null, key);
    }
  }
});

test("redraw without a draw nor any password answers the list, all without", async () => {
  const store = createMemoryStore();
  const { status, body } = await call(store, { password: ADMIN, action: "redraw" });
  assert.equal(status, 200);
  assert.ok(body.participants.every((/** @type {any} */ p) => p.hasPassword === false));
});

test("redraw follows the admin password and the rule of the 5 attempts", async () => {
  const store = await chosen();
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(await call(store, { password: "faux", action: "redraw" }), {
      status: 401,
      body: { error: "wrong_password" },
    });
  }
  const locked = { status: 429, body: { error: "locked" } };
  assert.deepEqual(await call(store, { password: "faux", action: "redraw" }), locked);
  assert.deepEqual(await call(store, { password: ADMIN, action: "redraw" }), locked);
  assert.equal(await store.get("draw"), OLD_DRAW);
  assert.notEqual(await store.get("password:lea"), null);
});

test("without ADMIN_PASSWORD, redraw answers 503 and erases nothing", async () => {
  const store = await chosen();
  const response = await answerReserved(store, { password: "", action: "redraw" }, "");
  assert.equal(response.status, 503);
  assert.equal(await store.get("draw"), OLD_DRAW);
});

test("redraw never answers a draw, a hash or a password", async () => {
  const store = await chosen();
  const hash = String(await store.get("password:lea"));
  const text = await (
    await answerReserved(store, { password: ADMIN, action: "redraw" }, ADMIN)
  ).text();
  for (const secret of [OLD_DRAW, hash, ...hash.split("$"), "sapin", ADMIN, "receiver"]) {
    assert.ok(!text.includes(secret), secret);
  }
});

test("after a redraw, the next choice makes a new draw and gives a name of it", async () => {
  const store = await chosen();
  await redraw(store);
  const answer = await choosePassword(store, "lea", "houx");
  const draw = JSON.parse(String(await store.get("draw")));
  assert.deepEqual(answer, { receiver: nameOf(draw.lea) });
  assert.notEqual(draw.lea, "lea");
});

test("open-gift on a password left without a draw: no_password, no draw made", async () => {
  const store = await chosen();
  await store.del("draw");
  await assert.rejects(openGift(store, "anne", "etoile"), { status: 409, code: "no_password" });
  assert.equal(await store.get("draw"), null);
});

/** A promise and the function that resolves it. */
function gate() {
  /** @type {() => void} */
  let open = () => {};
  /** @type {Promise<void>} */
  const opened = new Promise((resolve) => {
    open = () => resolve();
  });
  return { opened, open };
}

/** The number of store commands of a redraw: the draw, then 3 per participant. */
const REDRAW_COMMANDS = 1 + 3 * participants.length;

/**
 * The store with `before` awaited before each command.
 * @param {Store} inner
 * @param {() => Promise<void>} before
 * @returns {Store}
 */
function wrap(inner, before) {
  const wrapped = Object.fromEntries(
    Object.entries(inner).map(([name, command]) => {
      const run = /** @type {(...args: unknown[]) => Promise<unknown>} */ (command);
      return [
        name,
        async (/** @type {unknown[]} */ ...args) => {
          await before();
          return run(...args);
        },
      ];
    }),
  );
  return /** @type {Store} */ (/** @type {unknown} */ (wrapped));
}

/**
 * One interleaving of a redraw with an action of Yannick: the redraw's commands before
 * `split` run just before the action's command number `first` (from 0), the others just
 * before its command number `second`; a number past the action's last command runs them once
 * the action has ended. Every command of both goes to the same memory store.
 * @param {(store: Store) => Promise<{ receiver: string }>} action
 * @param {Store} inner
 * @param {{ split: number, first: number, second: number }} at
 */
async function race(action, inner, { split, first, second }) {
  const paused = gate();
  const resumed = gate();
  let commands = 0;
  const redrawStore = wrap(inner, async () => {
    if (commands++ === split) {
      paused.open();
      await resumed.opened;
    }
  });
  /** @type {Promise<void> | undefined} */
  let redrawn;
  const start = async () => {
    redrawn ??= redraw(redrawStore).then(paused.open);
    await paused.opened;
  };
  const finish = async () => {
    await start();
    resumed.open();
    await redrawn;
  };
  let step = 0;
  const actionStore = wrap(inner, async () => {
    if (step === first) await start();
    if (step === second) await finish();
    step += 1;
  });
  /** @type {{ receiver: string } | HttpError} */
  let result;
  try {
    result = await action(actionStore);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    result = error;
  }
  await finish();
  return { result, steps: step };
}

/**
 * Every interleaving of a redraw with the action, in two blocks: the redraw cut just after
 * erasing the draw, just after erasing Yannick's password, or not cut. After both, Yannick
 * either has no password, or the name he saw is his in the draw kept (S8).
 * @param {() => Promise<Store>} setup
 * @param {(store: Store) => Promise<{ receiver: string }>} action
 * @param {(result: unknown) => void} checkResult
 */
async function everyInterleaving(setup, action, checkResult) {
  const { steps } = await race(action, await setup(), {
    split: REDRAW_COMMANDS,
    first: 99,
    second: 99,
  });
  const cases = [];
  for (const split of [1, 4, REDRAW_COMMANDS]) {
    for (let first = 0; first <= steps + 2; first++) {
      const seconds = split === REDRAW_COMMANDS ? [first] : [];
      if (split !== REDRAW_COMMANDS) for (let s = first; s <= steps + 2; s++) seconds.push(s);
      for (const second of seconds) cases.push({ split, first, second });
    }
  }
  const outcomes = await Promise.all(
    cases.map(async (at) => {
      const inner = await setup();
      const { result } = await race(action, inner, at);
      return { at, inner, result };
    }),
  );
  const seen = new Set();
  for (const { at, inner, result } of outcomes) {
    const where = JSON.stringify(at);
    checkResult(result);
    const stored = await inner.get("password:yannick");
    const drawText = await inner.get("draw");
    if (stored !== null) {
      assert.notEqual(drawText, null, `${where}: a password without a draw`);
      if (!(result instanceof HttpError)) {
        const kept = nameOf(JSON.parse(String(drawText)).yannick);
        assert.equal(result.receiver, kept, `${where}: a password with a former name`);
      }
    }
    seen.add(`${stored === null}-${result instanceof HttpError ? result.code : "receiver"}`);
  }
  return { cases: cases.length, seen };
}

/** Yannick chooses the password « sapin », with a draw where he gives to Léa. */
async function withDraw() {
  const store = createMemoryStore();
  await store.setIfAbsent("draw", OLD_DRAW);
  return store;
}

/** Yannick's hash of « sapin », made once for every interleaving. */
const sapin = hashPassword("sapin");

/** As `withDraw`, Yannick having chosen « sapin » already. */
async function withPassword() {
  const store = await withDraw();
  await store.setIfAbsent("password:yannick", await sapin);
  return store;
}

/** @param {unknown} result */
const isReceiver = (result) => {
  assert.ok(!(result instanceof HttpError), String(result));
};

test("race of a redraw with a first choice: never a password with a former name", async () => {
  const { cases, seen } = await everyInterleaving(
    withDraw,
    (store) => choosePassword(store, "yannick", "sapin"),
    isReceiver,
  );
  assert.ok(cases >= 40, String(cases));
  // Both ends happen: the password erased by the redraw, or kept with the new draw.
  assert.ok(seen.has("true-receiver") && seen.has("false-receiver"), [...seen].join());
});

test("race of a redraw with the same password chosen again: never a former name", async () => {
  const { seen } = await everyInterleaving(
    withPassword,
    (store) => choosePassword(store, "yannick", "sapin"),
    isReceiver,
  );
  assert.ok(seen.has("true-receiver") && seen.has("false-receiver"), [...seen].join());
});

test("race of a redraw with open-gift: the name, or no_password; never a former name", async () => {
  const { seen } = await everyInterleaving(
    withPassword,
    (store) => openGift(store, "yannick", "sapin"),
    (result) => {
      if (result instanceof HttpError) assert.equal(result.code, "no_password");
    },
  );
  assert.ok(seen.has("true-receiver") && seen.has("true-no_password"), [...seen].join());
});
