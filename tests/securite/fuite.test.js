// The leak test: nothing secret is sent to the browser. A complete journey on the memory
// store, with a fictitious draw and witness passwords; every answer (pages, scripts, JSON) is
// searched for a hash, a salt, a password, ADMIN_PASSWORD, the draw of another participant and
// the whole draw. public/ names no environment variable.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { POST as choosePassword } from "../../api/choose-password.js";
import { GET as health } from "../../api/health.js";
import { POST as openGift } from "../../api/open-gift.js";
import { POST as participant } from "../../api/participant.js";
import { POST as reserved } from "../../api/reserved.js";
import { normalizePassword } from "../../lib/password.js";
import { getStore } from "../../lib/store.js";

delete process.env.VERCEL_ENV;
process.env.SECRET_SANTA_STORE = "memory";
const adminPassword = "Admin-Témoin-4812";
process.env.ADMIN_PASSWORD = adminPassword;

const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

/**
 * The names of the participants, by id.
 * @type {Record<string, string>}
 */
const names = {
  yannick: "Yannick",
  lea: "Léa",
  christine: "Christine",
  guigui: "Guigui",
  mamet: "Mamet",
  anne: "Anne",
  loulou: "Loulou",
};

/** A fictitious draw, written before the journey: giver id to receiver id. */
const draw = {
  yannick: "christine",
  lea: "mamet",
  christine: "guigui",
  guigui: "anne",
  mamet: "loulou",
  anne: "yannick",
  loulou: "lea",
};

/** The witness passwords typed in the journey. */
const passwords = {
  lea: "  Témoin-Sapin-7391 ",
  leaAgain: "TEMOIN-SAPIN-7391",
  leaOther: "Témoin-Gui-2254",
  leaNew: "Témoin-Houx-6630",
  christine: "Témoin-Neige-1187",
  wrong: "Témoin-Faux-9043",
};

/** The environment variables of the project and of its integrations. */
const envNames = [
  "ADMIN_PASSWORD",
  "SECRET_SANTA_STORE",
  "VERCEL_ENV",
  "VERCEL_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN",
  "KV_URL",
  "REDIS_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

/**
 * @typedef {object} Answer
 * @property {string} label What was asked.
 * @property {string} path The function called.
 * @property {string | undefined} giver The participant of the call, if any.
 * @property {number} status
 * @property {string} headers
 * @property {string} text
 */

/** @type {Answer[]} */
const answers = [];

/** Every hash written during the journey, read from the store right after each choice. */
/** @type {Set<string>} */
const hashes = new Set();

/**
 * Calls a function with a JSON body and keeps its answer.
 * @param {string} label
 * @param {string} path
 * @param {(request: Request) => Promise<Response>} fn
 * @param {Record<string, unknown> | string} body
 * @param {string} [type]
 */
async function call(label, path, fn, body, type = "application/json") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    body: text,
    headers: { "Content-Type": type },
  });
  const response = await fn(request);
  const answer = {
    label,
    path,
    giver: typeof body === "object" ? /** @type {string | undefined} */ (body.participant) : "",
    status: response.status,
    headers: JSON.stringify([...response.headers]),
    text: await response.text(),
  };
  if (path === "/api/reserved") answer.giver = undefined;
  answers.push(answer);
  return { status: answer.status, body: JSON.parse(answer.text) };
}

/**
 * Chooses a password, then keeps the hash written.
 * @param {string} id
 * @param {string} password
 */
async function choose(id, password) {
  const answer = await call(`choose ${id}`, "/api/choose-password", choosePassword, {
    participant: id,
    password,
  });
  const hash = await getStore().get(`password:${id}`);
  if (hash) hashes.add(hash);
  return answer;
}

/**
 * @param {string} id
 * @param {string} password
 */
const open = (id, password) =>
  call(`open ${id}`, "/api/open-gift", openGift, { participant: id, password });

/**
 * @param {string} password
 * @param {string} action
 * @param {string} [id]
 */
const admin = (password, action, id) =>
  call(`reserved ${action}`, "/api/reserved", reserved, { password, action, participant: id });

/** The complete journey, every answer kept in `answers`. */
async function journey() {
  assert.equal(await getStore().setIfAbsent("draw", JSON.stringify(draw)), true);
  const healthAnswer = health();
  answers.push({
    label: "health",
    path: "/api/health",
    giver: undefined,
    status: healthAnswer.status,
    headers: JSON.stringify([...healthAnswer.headers]),
    text: await healthAnswer.text(),
  });

  // S1, S2: Léa arrives, a password too short, then hers; the gift gives Mamet.
  const state = { participant: "lea" };
  assert.deepEqual((await call("state lea", "/api/participant", participant, state)).body, {
    hasPassword: false,
  });
  assert.equal((await choose("lea", "ab ")).status, 422);
  assert.equal((await choose("lea", passwords.lea)).body.receiver, "Mamet");

  // S3: she comes back; a wrong one, the same in capitals, another one on the first screen.
  assert.deepEqual((await call("state lea", "/api/participant", participant, state)).body, {
    hasPassword: true,
  });
  assert.equal((await open("lea", passwords.wrong)).status, 401);
  assert.equal((await open("lea", passwords.leaAgain)).body.receiver, "Mamet");
  assert.equal((await choose("lea", passwords.leaOther)).status, 409);
  assert.equal((await choose("lea", passwords.lea)).body.receiver, "Mamet");

  // S6: the reserved page, a wrong password, the list, Léa erased.
  assert.equal((await admin(passwords.lea, "list")).status, 401);
  assert.equal((await admin(adminPassword, "list")).status, 200);
  assert.equal((await admin(adminPassword, "erase", "lea")).status, 200);
  assert.equal((await admin(adminPassword, "unknown")).status, 400);
  assert.equal((await admin(adminPassword, "erase", "inconnu")).status, 400);

  // T2, then S2 again: same name.
  assert.equal((await open("lea", passwords.lea)).status, 409);
  assert.equal((await choose("lea", passwords.leaNew)).body.receiver, "Mamet");

  // S3: Christine, 5 wrong attempts, then locked even with hers; erased by Yannick.
  assert.equal((await choose("christine", passwords.christine)).body.receiver, "Guigui");
  for (let i = 1; i <= 5; i += 1) {
    assert.equal((await open("christine", passwords.wrong)).status, i < 5 ? 401 : 429);
  }
  assert.equal((await open("christine", passwords.christine)).status, 429);
  assert.equal((await admin(adminPassword, "erase", "christine")).status, 200);

  // Errors of the functions.
  assert.equal((await choose("inconnu", passwords.lea)).status, 400);
  const broken = await call("broken", "/api/open-gift", openGift, "{", "application/json");
  assert.equal(broken.status, 400);
  const plain = await call("plain", "/api/open-gift", openGift, "lea", "text/plain");
  assert.equal(plain.status, 415);
  const large = { participant: "lea", password: passwords.lea.repeat(200) };
  assert.equal((await call("large", "/api/open-gift", openGift, large)).status, 413);

  // S6: 5 wrong administration passwords, then locked even with the right one.
  for (let i = 1; i <= 5; i += 1) {
    assert.equal((await admin(passwords.wrong, "list")).status, i < 5 ? 401 : 429);
  }
  assert.equal((await admin(adminPassword, "list")).status, 429);
}

/** The files of public/, as the site serves them, by path. */
async function publicFiles() {
  const entries = await readdir(publicDir, { recursive: true, withFileTypes: true });
  /** @type {{ path: string, text: string }[]} */
  const files = [];
  for (const entry of entries.filter((e) => e.isFile())) {
    const file = join(entry.parentPath, entry.name);
    files.push({ path: relative(publicDir, file), text: await readFile(file, "utf8") });
  }
  return files;
}

/** The secrets that no answer may contain, with what each one is. */
function secrets() {
  /** @type {[string, string][]} */
  const list = [
    ["ADMIN_PASSWORD", adminPassword],
    ["the whole draw", JSON.stringify(draw)],
    ["a hash", "scrypt$"],
  ];
  for (const [name, password] of Object.entries(passwords)) {
    list.push([`password ${name}`, password], [`password ${name}`, password.trim()]);
    list.push([`normalized password ${name}`, normalizePassword(password)]);
  }
  for (const hash of hashes) {
    const [salt, key] = hash.split("$").slice(-2);
    list.push(["a hash", hash], ["a salt", salt], ["a hash key", key]);
    list.push(["a salt", Buffer.from(salt, "base64").toString("hex")]);
    list.push(["a hash key", Buffer.from(key, "base64").toString("hex")]);
  }
  for (const [giver, receiver] of Object.entries(draw)) {
    list.push(["a pair of the draw", `"${giver}":"${receiver}"`]);
  }
  return list;
}

/**
 * The fields that the answer of a function may have, and nothing else.
 * @param {Answer} answer
 * @param {any} body
 */
function checkShape(answer, body) {
  const where = `${answer.label} (${answer.status})`;
  const headers = JSON.parse(answer.headers).map((/** @type {[string, string]} */ [key]) => key);
  assert.deepEqual(headers.sort(), ["cache-control", "content-type"], where);
  if (answer.status !== 200) {
    assert.deepEqual(Object.keys(body), ["error"], where);
    assert.match(body.error, /^[a-z_]+$/, where);
  } else if (answer.path === "/api/participant") {
    assert.deepEqual(Object.keys(body), ["hasPassword"], where);
  } else if (answer.path === "/api/reserved") {
    assert.deepEqual(Object.keys(body), ["participants"], where);
    for (const row of body.participants) {
      assert.deepEqual(Object.keys(row), ["id", "name", "hasPassword"], where);
      assert.equal(typeof row.hasPassword, "boolean", where);
    }
  } else if (answer.path === "/api/health") {
    assert.deepEqual(Object.keys(body), ["ok", "store", "reservedPage"], where);
  } else {
    // Only the name drawn by the participant of the call: never the draw of another one.
    const giver = /** @type {keyof typeof draw} */ (answer.giver);
    assert.deepEqual(body, { receiver: names[draw[giver]] }, where);
  }
}

test("the journey sends nothing secret to the browser", async () => {
  await journey();
  const files = await publicFiles();
  assert.ok(files.some((file) => file.path === "index.html"));
  assert.ok(hashes.size >= 3, "each choice wrote a hash");
  const list = secrets();
  const served = [
    ...files.map((file) => ({ where: `public/${file.path}`, text: file.text })),
    ...answers.map((a) => ({ where: `${a.label} (${a.status})`, text: a.headers + a.text })),
  ];
  for (const { where, text } of served) {
    for (const [what, secret] of list) {
      assert.ok(!text.includes(secret), `${where} contains ${what}`);
    }
  }
  for (const answer of answers) checkShape(answer, JSON.parse(answer.text));
});

test("public/ names no environment variable", async () => {
  for (const file of await publicFiles()) {
    for (const name of [...envNames, "process.env"]) {
      assert.ok(!file.text.includes(name), `public/${file.path} names ${name}`);
    }
  }
});
