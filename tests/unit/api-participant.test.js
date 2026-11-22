import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as choosePassword } from "../../api/choose-password.js";
import { POST as openGift } from "../../api/open-gift.js";
import { POST as participant } from "../../api/participant.js";
import { MAX_BODY_BYTES } from "../../lib/http.js";
import { getStore } from "../../lib/store.js";

delete process.env.VERCEL_ENV;
process.env.SECRET_SANTA_STORE = "memory";

const FUNCTIONS = { participant, choosePassword, openGift };

/**
 * A POST request to a function.
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function post(body, headers = { "Content-Type": "application/json" }) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/test", { method: "POST", body: text, headers });
}

/**
 * Calls a function and returns its status and JSON body, checking it is never cached.
 * @param {(request: Request) => Promise<Response>} fn
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
async function call(fn, body, headers) {
  const response = await fn(post(body, headers));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return { status: response.status, body: await response.json() };
}

for (const [name, fn] of Object.entries(FUNCTIONS)) {
  test(`${name}: 400 for an unknown participant`, async () => {
    assert.deepEqual(await call(fn, { participant: "inconnu", password: "sapin" }), {
      status: 400,
      body: { error: "unknown_participant" },
    });
    assert.equal((await call(fn, {})).status, 400);
    assert.equal((await call(fn, "null")).status, 400);
  });

  test(`${name}: 415 without a JSON content type`, async () => {
    const answer = await call(fn, { participant: "lea" }, { "Content-Type": "text/plain" });
    assert.equal(answer.status, 415);
  });

  test(`${name}: 413 for a body over 2 KB`, async () => {
    const answer = await call(fn, { participant: "lea", password: "a".repeat(MAX_BODY_BYTES) });
    assert.equal(answer.status, 413);
  });
}

test("participant: 200 with hasPassword, before and after the choice", async () => {
  assert.deepEqual(await call(participant, { participant: "yannick" }), {
    status: 200,
    body: { hasPassword: false },
  });
  assert.equal(
    (await call(choosePassword, { participant: "yannick", password: "sapin" })).status,
    200,
  );
  assert.deepEqual(await call(participant, { participant: "yannick" }), {
    status: 200,
    body: { hasPassword: true },
  });
});

test("choose-password: 200 with the name drawn, 422, 409, 429", async () => {
  const chosen = await call(choosePassword, { participant: "lea", password: "sapin" });
  assert.equal(chosen.status, 200);
  assert.deepEqual(Object.keys(chosen.body), ["receiver"]);
  assert.equal(typeof chosen.body.receiver, "string");
  assert.notEqual(chosen.body.receiver, "Léa");
  assert.deepEqual(await call(choosePassword, { participant: "christine", password: " ab " }), {
    status: 422,
    body: { error: "too_short" },
  });
  assert.deepEqual(await call(choosePassword, { participant: "lea", password: 1234 }), {
    status: 400,
    body: { error: "invalid_password" },
  });
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(await call(choosePassword, { participant: "lea", password: "etoile" }), {
      status: 409,
      body: { error: "already_chosen" },
    });
  }
  assert.deepEqual(await call(choosePassword, { participant: "lea", password: "etoile" }), {
    status: 429,
    body: { error: "locked" },
  });
});

test("open-gift: 409 no_password, 200 with the same name, 401, 429", async () => {
  assert.deepEqual(await call(openGift, { participant: "anne", password: "sapin" }), {
    status: 409,
    body: { error: "no_password" },
  });
  const chosen = await call(choosePassword, { participant: "anne", password: "Noël" });
  assert.deepEqual(await call(openGift, { participant: "anne", password: "NOEL" }), chosen);
  assert.deepEqual(await call(openGift, { participant: "anne", password: null }), {
    status: 400,
    body: { error: "invalid_password" },
  });
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(await call(openGift, { participant: "anne", password: "etoile" }), {
      status: 401,
      body: { error: "wrong_password" },
    });
  }
  assert.deepEqual(await call(openGift, { participant: "anne", password: "etoile" }), {
    status: 429,
    body: { error: "locked" },
  });
  assert.equal((await call(openGift, { participant: "anne", password: "noel" })).status, 429);
});

test("the functions write to the store of the environment", async () => {
  await call(choosePassword, { participant: "mamet", password: "sapin" });
  assert.notEqual(await getStore().get("password:mamet"), null);
});
