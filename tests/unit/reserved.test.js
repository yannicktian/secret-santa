import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST } from "../../api/reserved.js";
import { attempt } from "../../lib/attempts.js";
import { createMemoryStore } from "../../lib/memory-store.js";
import { participants } from "../../lib/participants.js";
import { hashPassword } from "../../lib/password.js";
import {
  answerReserved,
  checkAdminPassword,
  erasePassword,
  listParticipants,
} from "../../lib/reserved.js";
import { getStore } from "../../lib/store.js";

const ADMIN = "Admin-Fictif 42";
const DRAW = JSON.stringify({
  yannick: "christine",
  lea: "mamet",
  christine: "yannick",
  guigui: "loulou",
  mamet: "anne",
  anne: "lea",
  loulou: "guigui",
});

/**
 * A memory store with a clock the test advances, that fails if the key `draw` is read
 * or written. `inner` gives the test access to the whole store.
 */
function setup() {
  const clock = { now: 0 };
  const inner = createMemoryStore({ now: () => clock.now });
  /** @param {string[]} keys */
  const guard = (keys) => {
    if (keys.includes("draw")) throw new Error("the reserved page touched the draw");
  };
  /** @type {import("../../lib/store.js").Store} */
  const store = {
    get: async (key) => {
      guard([key]);
      return inner.get(key);
    },
    mget: async (keys) => {
      guard(keys);
      return inner.mget(keys);
    },
    setIfAbsent: async (key, value) => {
      guard([key]);
      return inner.setIfAbsent(key, value);
    },
    setWithExpiry: async (key, value, seconds) => {
      guard([key]);
      return inner.setWithExpiry(key, value, seconds);
    },
    incr: async (key) => {
      guard([key]);
      return inner.incr(key);
    },
    del: async (key) => {
      guard([key]);
      return inner.del(key);
    },
  };
  return { clock, inner, store };
}

/**
 * Calls the reserved page's rule and returns its status and JSON body.
 * @param {import("../../lib/store.js").Store} store
 * @param {unknown} body
 * @param {{ adminPassword?: string }} [env] The variables; `ADMIN_PASSWORD` by default.
 */
async function call(store, body, env = { adminPassword: ADMIN }) {
  const response = await answerReserved(store, body, env.adminPassword);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return { status: response.status, body: await response.json() };
}

test("the admin password is compared as is, without normalization", async () => {
  const { store } = setup();
  assert.equal(await checkAdminPassword(store, ADMIN, ADMIN), "ok");
  for (const other of ["admin-fictif 42", " Admin-Fictif 42", "Admin-Fictif 42 ", "Admin"]) {
    assert.equal(await checkAdminPassword(store, other, ADMIN), "wrong_password", other);
  }
  const { store: fresh } = setup();
  assert.equal(await checkAdminPassword(fresh, "Admin", "admin"), "wrong_password");
  assert.equal(await checkAdminPassword(fresh, "admin", "admin"), "ok");
});

test("a password that is not a string is a wrong attempt", async () => {
  const { store } = setup();
  for (const password of [undefined, null, 42, [ADMIN], { ADMIN }]) {
    assert.equal(await checkAdminPassword(store, password, ADMIN), "wrong_password");
    await checkAdminPassword(store, ADMIN, ADMIN);
  }
});

test("wrong password: wrong_password, locked at the fifth, the right one refused for a minute", async () => {
  const { clock, store } = setup();
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(await call(store, { password: "faux", action: "list" }), {
      status: 401,
      body: { error: "wrong_password" },
    });
  }
  const locked = { status: 429, body: { error: "locked" } };
  assert.deepEqual(await call(store, { password: "faux", action: "list" }), locked);
  assert.deepEqual(await call(store, { password: ADMIN, action: "list" }), locked);
  clock.now += 59_999;
  assert.deepEqual(await call(store, { password: ADMIN, action: "list" }), locked);
  clock.now += 1;
  assert.equal((await call(store, { password: ADMIN, action: "list" })).status, 200);
});

test("the admin lock does not lock the participants", async () => {
  const { inner, store } = setup();
  for (let i = 0; i < 5; i++) await call(store, { password: "faux", action: "list" });
  assert.equal(await inner.get("lock:admin"), "1");
  assert.equal(await attempt(store, "yannick", () => true), "ok");
});

test("without ADMIN_PASSWORD, or empty, every call answers 503 without counting", async () => {
  const { inner, store } = setup();
  for (const adminPassword of [undefined, ""]) {
    for (const body of [
      { password: "", action: "list" },
      { password: "faux", action: "list" },
      { password: "faux", action: "erase", participant: "lea" },
      { password: "", action: "inconnue" },
    ]) {
      assert.deepEqual(await call(store, body, { adminPassword }), {
        status: 503,
        body: { error: "admin_password_missing" },
      });
    }
  }
  assert.equal(await inner.get("fails:admin"), null);
});

test("the list is in the order of the scope, with hasPassword", async () => {
  const { inner, store } = setup();
  await inner.setIfAbsent("password:lea", await hashPassword("noel"));
  await inner.setIfAbsent("password:loulou", await hashPassword("sapin"));
  const expected = participants.map(({ id, name }) => ({
    id,
    name,
    hasPassword: id === "lea" || id === "loulou",
  }));
  assert.deepEqual(await listParticipants(store), expected);
  assert.deepEqual(await call(store, { password: ADMIN, action: "list" }), {
    status: 200,
    body: { participants: expected },
  });
  assert.deepEqual(
    expected.map(({ name }) => name),
    ["Yannick", "Léa", "Christine", "Guigui", "Mamet", "Anne", "Loulou"],
  );
});

test("erasing: no password yet, the draw unchanged, the list in the answer", async () => {
  const { inner, store } = setup();
  await inner.setIfAbsent("draw", DRAW);
  await inner.setIfAbsent("password:lea", await hashPassword("noel"));
  await inner.setIfAbsent("password:anne", await hashPassword("sapin"));
  const { status, body } = await call(store, {
    password: ADMIN,
    action: "erase",
    participant: "lea",
  });
  assert.equal(status, 200);
  assert.deepEqual(
    body.participants.map((/** @type {{ hasPassword: boolean }} */ p) => p.hasPassword),
    [false, false, false, false, false, true, false],
  );
  assert.equal(await inner.get("password:lea"), null);
  assert.notEqual(await inner.get("password:anne"), null);
  assert.equal(await inner.get("draw"), DRAW);
});

test("erasing removes the count and the lock: 5 new attempts for the new password", async () => {
  const { inner, store } = setup();
  await inner.setIfAbsent("password:lea", await hashPassword("noel"));
  for (let i = 0; i < 4; i++) await attempt(store, "lea", () => false);
  assert.equal(await inner.get("fails:lea"), "4");
  await erasePassword(store, "lea");
  assert.equal(await inner.get("fails:lea"), null);
  await inner.setIfAbsent("password:lea", await hashPassword("sapin"));
  const answers = [];
  for (let i = 0; i < 5; i++) answers.push(await attempt(store, "lea", () => false));
  assert.deepEqual(answers, [...Array(4).fill("wrong_password"), "locked"]);
  assert.equal(await inner.get("lock:lea"), "1");
  await erasePassword(store, "lea");
  assert.equal(await inner.get("lock:lea"), null);
  assert.equal(await inner.get("password:lea"), null);
});

test("erasing a participant without a password leaves them without", async () => {
  const { inner, store } = setup();
  const { status, body } = await call(store, {
    password: ADMIN,
    action: "erase",
    participant: "guigui",
  });
  assert.equal(status, 200);
  assert.equal(body.participants[3].hasPassword, false);
  assert.equal(await inner.get("password:guigui"), null);
});

test("an unknown action or participant answers 400 without counting an attempt", async () => {
  const { inner, store } = setup();
  for (const body of [
    { password: ADMIN },
    { password: ADMIN, action: "draw" },
    { password: ADMIN, action: "toString" },
    { password: "faux", action: "LIST" },
    null,
    [],
    "list",
  ]) {
    assert.deepEqual(await call(store, body), { status: 400, body: { error: "unknown_action" } });
  }
  for (const participant of [undefined, "admin", "Lea", "léa", "toString", 3]) {
    assert.deepEqual(await call(store, { password: "faux", action: "erase", participant }), {
      status: 400,
      body: { error: "unknown_participant" },
    });
  }
  assert.equal(await inner.get("fails:admin"), null);
});

test("no answer contains a draw, a hash or a password", async () => {
  const { inner, store } = setup();
  await inner.setIfAbsent("draw", DRAW);
  const hash = await hashPassword("motdepasse-temoin");
  await inner.setIfAbsent("password:christine", hash);
  await inner.setIfAbsent("password:yannick", await hashPassword("autre-temoin"));
  const bodies = [
    { password: "faux-temoin", action: "list" },
    { password: ADMIN, action: "list" },
    { password: ADMIN, action: "erase", participant: "yannick" },
    { password: ADMIN, action: "inconnue" },
    { password: ADMIN, action: "erase", participant: "personne" },
  ];
  const texts = [];
  for (const body of bodies) texts.push(await (await answerReserved(store, body, ADMIN)).text());
  texts.push(await (await answerReserved(store, bodies[1], "")).text());
  const secrets = [DRAW, hash, ...hash.split("$"), "motdepasse-temoin", "autre-temoin", ADMIN];
  for (const text of texts) {
    for (const secret of secrets) assert.ok(!text.includes(secret), `${secret} in ${text}`);
    assert.ok(!text.includes("receiver"), text);
    assert.ok(!text.includes("faux-temoin"), text);
  }
  const list = JSON.parse(texts[1]);
  for (const entry of list.participants) {
    assert.deepEqual(Object.keys(entry).sort(), ["hasPassword", "id", "name"]);
  }
});

const VARIABLES = ["SECRET_SANTA_STORE", "VERCEL_ENV", "ADMIN_PASSWORD"];
/** @type {Record<string, string | undefined>} */
let saved = {};

beforeEach(() => {
  saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of VARIABLES) delete process.env[name];
  process.env.SECRET_SANTA_STORE = "memory";
});

afterEach(() => {
  for (const name of VARIABLES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

/**
 * A POST to /api/reserved.
 * @param {unknown} body
 * @param {string} [type]
 */
function request(body, type = "application/json") {
  return new Request("http://localhost/api/reserved", {
    method: "POST",
    headers: { "Content-Type": type },
    body: JSON.stringify(body),
  });
}

test("POST /api/reserved lists with ADMIN_PASSWORD, in JSON and no-store", async () => {
  process.env.ADMIN_PASSWORD = ADMIN;
  const response = await POST(request({ password: ADMIN, action: "list" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const { participants: list } = await response.json();
  assert.equal(list.length, 7);
  await getStore().del("fails:admin");
});

test("POST /api/reserved answers 503 without ADMIN_PASSWORD", async () => {
  const response = await POST(request({ password: "", action: "list" }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "admin_password_missing" });
});

test("POST /api/reserved refuses a body that is not JSON", async () => {
  process.env.ADMIN_PASSWORD = ADMIN;
  const response = await POST(request({ password: ADMIN, action: "list" }, "text/plain"));
  assert.equal(response.status, 415);
});
