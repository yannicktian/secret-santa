import assert from "node:assert/strict";
import { test } from "node:test";
import { choosePassword, getOrCreateDraw, getParticipantState, openGift } from "../../lib/gift.js";
import { HttpError } from "../../lib/http.js";
import { createMemoryStore } from "../../lib/memory-store.js";
import { participants } from "../../lib/participants.js";

/** A fictitious draw, a single cycle: nobody gives to the one who gives to him. */
const DRAW = {
  yannick: "lea",
  lea: "christine",
  christine: "guigui",
  guigui: "mamet",
  mamet: "anne",
  anne: "loulou",
  loulou: "yannick",
};

/**
 * A memory store that records its writes, optionally with the fictitious draw.
 * @param {{ draw?: boolean }} [options]
 */
async function setup({ draw = true } = {}) {
  const inner = createMemoryStore();
  if (draw) await inner.setIfAbsent("draw", JSON.stringify(DRAW));
  /** @type {unknown[][]} */
  const writes = [];
  /** @type {import("../../lib/store.js").Store} */
  const store = {
    get: (key) => inner.get(key),
    mget: (keys) => inner.mget(keys),
    setIfAbsent: async (key, value) => {
      const written = await inner.setIfAbsent(key, value);
      writes.push(["setIfAbsent", key, written]);
      return written;
    },
    setWithExpiry: (key, value, seconds) => {
      writes.push(["setWithExpiry", key]);
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
  return { store, inner, writes };
}

/**
 * The erasure of the reserved page, as the architecture describes it.
 * @param {import("../../lib/store.js").Store} store
 * @param {string} id
 */
async function erase(store, id) {
  for (const key of [`password:${id}`, `fails:${id}`, `lock:${id}`]) await store.del(key);
}

/**
 * Asserts that a call fails with an HTTP error.
 * @param {Promise<unknown>} call
 * @param {number} status
 * @param {string} code
 */
async function rejectsWith(call, status, code) {
  await assert.rejects(call, (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test("the state says whether a password was chosen", async () => {
  const { store } = await setup();
  assert.deepEqual(await getParticipantState(store, "lea"), { hasPassword: false });
  await choosePassword(store, "lea", "sapin");
  assert.deepEqual(await getParticipantState(store, "lea"), { hasPassword: true });
  assert.deepEqual(await getParticipantState(store, "anne"), { hasPassword: false });
});

test("an unknown participant is refused by each action", async () => {
  const { store, writes } = await setup();
  for (const id of ["inconnu", "", undefined, null, 3, "__proto__", "toString"]) {
    await rejectsWith(getParticipantState(store, id), 400, "unknown_participant");
    await rejectsWith(choosePassword(store, id, "sapin"), 400, "unknown_participant");
    await rejectsWith(openGift(store, id, "sapin"), 400, "unknown_participant");
  }
  assert.deepEqual(writes, []);
});

test("a password that is not text is refused without writing anything", async () => {
  const { store, writes } = await setup({ draw: false });
  for (const password of [undefined, null, 1234, ["sapin"], { a: 1 }]) {
    await rejectsWith(choosePassword(store, "lea", password), 400, "invalid_password");
    await rejectsWith(openGift(store, "lea", password), 400, "invalid_password");
  }
  assert.deepEqual(writes, []);
});

test("too_short writes nothing, neither a hash nor a draw", async () => {
  const { store, writes } = await setup({ draw: false });
  for (const password of ["", "abc", "  ab  ", "   "]) {
    await rejectsWith(choosePassword(store, "lea", password), 422, "too_short");
  }
  assert.deepEqual(writes, []);
  assert.equal(await store.get("draw"), null);
});

test("the first choice makes the draw before writing the hash, and gives another name", async () => {
  const { store, writes } = await setup({ draw: false });
  const answer = await choosePassword(store, "lea", "sapin");
  assert.deepEqual(writes, [
    ["setIfAbsent", "draw", true],
    ["setIfAbsent", "password:lea", true],
  ]);
  const draw = JSON.parse(String(await store.get("draw")));
  const receiver = participants.find((participant) => participant.id === draw.lea);
  assert.deepEqual(answer, { receiver: receiver?.name });
  assert.notEqual(answer.receiver, "Léa");
});

test("two participants choosing at the same time make a single draw", async () => {
  const { inner } = await setup({ draw: false });
  let waiting = 2;
  /** @type {() => void} */
  let release = () => {};
  const bothRead = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  let drawsWritten = 0;
  /** @type {import("../../lib/store.js").Store} */
  const store = {
    ...inner,
    get: async (key) => {
      const value = await inner.get(key);
      if (key === "draw" && value === null && waiting > 0) {
        waiting -= 1;
        if (waiting === 0) release();
        await bothRead;
      }
      return value;
    },
    setIfAbsent: async (key, value) => {
      const written = await inner.setIfAbsent(key, value);
      if (key === "draw" && written) drawsWritten += 1;
      return written;
    },
  };
  const [lea, anne] = await Promise.all([
    choosePassword(store, "lea", "sapin"),
    choosePassword(store, "anne", "etoile"),
  ]);
  assert.equal(waiting, 0);
  assert.equal(drawsWritten, 1);
  const draw = JSON.parse(String(await store.get("draw")));
  const name = (/** @type {string} */ id) => participants.find((p) => p.id === id)?.name;
  assert.deepEqual(lea, { receiver: name(draw.lea) });
  assert.deepEqual(anne, { receiver: name(draw.anne) });
});

test("getOrCreateDraw keeps the same draw once written", async () => {
  const { store } = await setup({ draw: false });
  const first = await getOrCreateDraw(store);
  assert.deepEqual(await getOrCreateDraw(store), first);
  assert.deepEqual(Object.keys(first).sort(), participants.map((p) => p.id).sort());
});

test("choosing the same password twice gives 200 and the same name", async () => {
  const { store } = await setup();
  assert.deepEqual(await choosePassword(store, "lea", "sapin"), { receiver: "Christine" });
  assert.deepEqual(await choosePassword(store, "lea", " SAPIN "), { receiver: "Christine" });
  assert.equal(await store.get("fails:lea"), null);
});

test("choosing another password gives already_chosen, the attempt counted", async () => {
  const { store } = await setup();
  await choosePassword(store, "lea", "sapin");
  const hash = await store.get("password:lea");
  await rejectsWith(choosePassword(store, "lea", "etoile"), 409, "already_chosen");
  assert.equal(await store.get("fails:lea"), "1");
  assert.equal(await store.get("password:lea"), hash);
  assert.deepEqual(await openGift(store, "lea", "sapin"), { receiver: "Christine" });
});

test("choosing another password five times locks the participant", async () => {
  const { store } = await setup();
  await choosePassword(store, "lea", "sapin");
  for (let i = 0; i < 4; i++) {
    await rejectsWith(choosePassword(store, "lea", "etoile"), 409, "already_chosen");
  }
  await rejectsWith(choosePassword(store, "lea", "etoile"), 429, "locked");
  await rejectsWith(choosePassword(store, "lea", "sapin"), 429, "locked");
});

test("open-gift recognizes the password with capitals and accents, same name each time", async () => {
  const { store } = await setup();
  await choosePassword(store, "guigui", "noel");
  for (const password of ["noel", "Noël", "NOEL", "  noël  "]) {
    assert.deepEqual(await openGift(store, "guigui", password), { receiver: "Mamet" });
  }
});

test("a wrong password gives wrong_password, then locked at the fifth", async () => {
  const { store } = await setup();
  await choosePassword(store, "lea", "sapin");
  for (let i = 0; i < 4; i++) {
    await rejectsWith(openGift(store, "lea", "etoile"), 401, "wrong_password");
  }
  await rejectsWith(openGift(store, "lea", "etoile"), 429, "locked");
  await rejectsWith(openGift(store, "lea", "sapin"), 429, "locked");
});

test("no_password without a password, and no attempt counted", async () => {
  const { store, writes } = await setup();
  await rejectsWith(openGift(store, "lea", "sapin"), 409, "no_password");
  await choosePassword(store, "lea", "sapin");
  await erase(store, "lea");
  writes.length = 0;
  await rejectsWith(openGift(store, "lea", "sapin"), 409, "no_password");
  assert.deepEqual(writes, []);
});

test("after an erasure and a new choice, the same name", async () => {
  const { store } = await setup({ draw: false });
  const first = await choosePassword(store, "lea", "sapin");
  await erase(store, "lea");
  assert.deepEqual(await getParticipantState(store, "lea"), { hasPassword: false });
  assert.deepEqual(await choosePassword(store, "lea", "etoile"), first);
  assert.deepEqual(await openGift(store, "lea", "etoile"), first);
});

test("no answer contains the hash, the whole draw or who gives to the participant", async () => {
  const { store } = await setup();
  const answers = [
    await getParticipantState(store, "lea"),
    await choosePassword(store, "lea", "sapin"),
    await choosePassword(store, "lea", "sapin"),
    await openGift(store, "lea", "SAPIN"),
    await getParticipantState(store, "lea"),
  ];
  const hash = String(await store.get("password:lea"));
  const [salt, key] = hash.split("$").slice(-2);
  for (const answer of answers) {
    const text = JSON.stringify(answer);
    for (const secret of [hash, salt, key, "sapin", JSON.stringify(DRAW), "Yannick", "yannick"]) {
      assert.ok(!text.includes(secret), `${text} contains ${secret}`);
    }
    assert.ok(["receiver", "hasPassword"].includes(Object.keys(answer).join()), text);
  }
});

test("a password erased during a choice lets the choice be made again", async () => {
  const { store } = await setup();
  await choosePassword(store, "lea", "sapin");
  let erased = false;
  /** @type {import("../../lib/store.js").Store} */
  const racing = {
    ...store,
    setIfAbsent: async (key, value) => {
      const written = await store.setIfAbsent(key, value);
      if (key === "password:lea" && !written && !erased) {
        erased = true;
        await erase(store, "lea");
      }
      return written;
    },
  };
  assert.deepEqual(await choosePassword(racing, "lea", "etoile"), { receiver: "Christine" });
  assert.deepEqual(await openGift(store, "lea", "etoile"), { receiver: "Christine" });
  assert.equal(await store.get("fails:lea"), null);
});

test("open-gift never makes a draw", async () => {
  const { store } = await setup();
  await choosePassword(store, "lea", "sapin");
  await store.del("draw");
  await rejectsWith(openGift(store, "lea", "sapin"), 409, "no_password");
  assert.equal(await store.get("draw"), null);
});
