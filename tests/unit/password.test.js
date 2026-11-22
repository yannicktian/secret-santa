import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPassword,
  isLongEnough,
  normalizePassword,
  verifyPassword,
} from "../../lib/password.js";

test("case, accents and spaces at the ends do not count", async () => {
  const hash = await hashPassword("Noël");
  for (const password of ["Noël", "noel", "NOEL", "noel  "]) {
    assert.equal(await verifyPassword(password, hash), true, password);
  }
  assert.equal(normalizePassword("  Noël "), "noel");
});

test("another password does not match", async () => {
  const hash = await hashPassword("noelle");
  assert.equal(await verifyPassword("Noël", hash), false);
});

test("at least 4 characters, spaces at the ends removed", () => {
  for (const password of ["abc", "  abc  ", "a b", "🎄🎄🎄"]) {
    assert.equal(isLongEnough(password), false, password);
  }
  for (const password of ["abcd", "🎄🎄🎄🎄", "!!!!"]) {
    assert.equal(isLongEnough(password), true, password);
  }
});

test("a decomposed accent counts as one character", () => {
  assert.equal(isLongEnough("noë"), false);
  assert.equal(isLongEnough("noël"), true);
});

test("two hashes of the same password differ (salt)", async () => {
  assert.notEqual(await hashPassword("sapin"), await hashPassword("sapin"));
});

test("the hash has the scrypt form and does not contain the password", async () => {
  const hash = await hashPassword("Guirlande");
  assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
  const [, , , , salt, key] = hash.split("$");
  assert.equal(Buffer.from(salt, "base64").length, 16);
  assert.equal(Buffer.from(key, "base64").length, 32);
  assert.equal(hash.toLowerCase().includes("guirlande"), false);
});

test("a malformed hash matches nothing", async () => {
  const hash = await hashPassword("sapin");
  const [, , , , salt, key] = hash.split("$");
  const malformed = [
    "",
    "sapin",
    "scrypt$16384$8$1$",
    `scrypt$16384$8$1$${salt}`,
    `scrypt$16384$8$1$${salt}$${key}$extra`,
    `bcrypt$16384$8$1$${salt}$${key}`,
    `scrypt$1024$8$1$${salt}$${key}`,
    `scrypt$16384$8$1$${salt}$${key.slice(0, 8)}`,
    `scrypt$16384$8$1$$${key}`,
  ];
  for (const value of malformed) {
    assert.equal(await verifyPassword("sapin", value), false, value);
  }
});
