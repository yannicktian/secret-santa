/** The largest JSON body a function reads, in bytes. */
export const MAX_BODY_BYTES = 2048;

/** An error that becomes the answer `{ error: code }` with its status. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   */
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/**
 * A JSON answer, never cached.
 * @param {unknown} body
 * @param {number} [status]
 */
export function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * An error answer `{ error: code }`, never cached.
 * @param {number} status
 * @param {string} code
 */
export function fail(status, code) {
  return json({ error: code }, status);
}

/**
 * Reads the JSON body of a request: `application/json` only (415), at most
 * `MAX_BODY_BYTES` bytes (413), valid JSON (400).
 * @param {Request} request
 * @returns {Promise<unknown>}
 */
export async function readJson(request) {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "unsupported_media_type");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
    throw new HttpError(413, "body_too_large");
  }
  const text = new TextDecoder().decode(await readBounded(request));
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

/**
 * Reads the body as bytes, stopping as soon as it passes `MAX_BODY_BYTES`.
 * @param {Request} request
 */
async function readBounded(request) {
  if (!request.body) return new Uint8Array();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Wraps a function handler: an `HttpError` becomes its answer, any other error a 500
 * `{ error: "internal" }`, without its message.
 * @param {(request: Request) => Promise<Response>} handler
 * @returns {(request: Request) => Promise<Response>}
 */
export function handle(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.code);
      return fail(500, "internal");
    }
  };
}
