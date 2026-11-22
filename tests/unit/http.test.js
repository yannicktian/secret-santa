import assert from "node:assert/strict";
import test from "node:test";
import { fail, handle, json, MAX_BODY_BYTES, readJson } from "../../lib/http.js";

const echo = handle(async (request) => json({ received: await readJson(request) }));

/**
 * @param {BodyInit | null} body
 * @param {Record<string, string>} [headers]
 */
function post(body, headers = { "Content-Type": "application/json" }) {
  return new Request("http://localhost/api/test", { method: "POST", body, headers });
}

/**
 * A JSON text of exactly `size` bytes: `{"x":"aaa…"}`.
 * @param {number} size
 */
function jsonOfSize(size) {
  return JSON.stringify({ x: "a".repeat(size - 8) });
}

test("a JSON body is read", async () => {
  const response = await echo(post('{"participant":"lea"}'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: { participant: "lea" } });
});

test("a JSON content type with a charset is accepted", async () => {
  const response = await echo(post("{}", { "Content-Type": "application/json; charset=utf-8" }));
  assert.equal(response.status, 200);
});

test("a body of exactly 2 KB is accepted", async () => {
  assert.equal(MAX_BODY_BYTES, 2048);
  const body = jsonOfSize(2048);
  assert.equal(Buffer.byteLength(body), 2048);
  const response = await echo(post(body));
  assert.equal(response.status, 200);
});

test("a body of more than 2 KB is refused with 413", async () => {
  const response = await echo(post(jsonOfSize(2049)));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "body_too_large" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("a streamed body of more than 2 KB, without Content-Length, is refused with 413", async () => {
  const chunk = new TextEncoder().encode("a".repeat(1024));
  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent === 3) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(chunk);
    },
  });
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    body: stream,
    headers: { "Content-Type": "application/json" },
    // @ts-expect-error `duplex` is required by Node for a stream body, missing from the DOM types
    duplex: "half",
  });
  assert.equal(request.headers.get("Content-Length"), null);
  const response = await echo(request);
  assert.equal(response.status, 413);
});

test("a content type other than JSON is refused with 415", async () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "application/jsonp"]) {
    const response = await echo(post("{}", { "Content-Type": type }));
    assert.equal(response.status, 415, type);
    assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("a body without content type is refused with 415", async () => {
  const response = await echo(post(new Uint8Array([123, 125]), {}));
  assert.equal(response.status, 415);
});

test("a body that is not JSON is refused with 400, without echoing it", async () => {
  const response = await echo(post("motdepasse-temoin"));
  assert.equal(response.status, 400);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { error: "invalid_json" });
  assert.ok(!text.includes("motdepasse-temoin"));
});

test("json() answers JSON in no-store", async () => {
  const response = json({ ok: true });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(response.headers.get("Content-Type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { ok: true });
});

test("fail() answers { error } in no-store", async () => {
  const response = fail(409, "already_chosen");
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { error: "already_chosen" });
});

test("an unexpected error answers 500 in no-store, without its message", async () => {
  const broken = handle(async () => {
    throw new Error("detail-temoin");
  });
  const response = await broken(post("{}"));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { error: "internal" });
  assert.ok(!text.includes("detail-temoin"));
});
