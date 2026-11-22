import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync =
  /** @type {(password: string, salt: Buffer, keylen: number, options: import("node:crypto").ScryptOptions) => Promise<Buffer>} */ (
    promisify(scrypt)
  );

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$`;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * The password as it is recognized (D4): spaces at the ends removed, accents removed,
 * lower case. « Noël », « noel » and « NOEL » give `noel`.
 * @param {string} password
 */
export function normalizePassword(password) {
  return password.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * At least 4 characters (S2, T3): code points of the password without its spaces at the
 * ends, in NFC.
 * @param {string} password
 */
export function isLongEnough(password) {
  return [...password.trim().normalize("NFC")].length >= 4;
}

/**
 * The salted scrypt hash of the normalized password:
 * `scrypt$16384$8$1$<salt in base64>$<key in base64>`.
 * @param {string} password
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Whether the password matches the hash, compared in constant time. A malformed hash
 * matches nothing.
 * @param {string} password
 * @param {string} passwordHash
 */
export async function verifyPassword(password, passwordHash) {
  if (!passwordHash.startsWith(PREFIX)) return false;
  const parts = passwordHash.slice(PREFIX.length).split("$");
  if (parts.length !== 2 || !parts.every((part) => BASE64.test(part))) return false;
  const salt = Buffer.from(parts[0], "base64");
  const expected = Buffer.from(parts[1], "base64");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  return timingSafeEqual(await derive(password, salt), expected);
}

/**
 * @param {string} password
 * @param {Buffer} salt
 */
function derive(password, salt) {
  return scryptAsync(normalizePassword(password), salt, KEY_BYTES, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  });
}
