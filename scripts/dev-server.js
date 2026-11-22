// The local server of the tests and captures: serves public/ as Vercel does (clean URLs,
// headers of vercel.json) and calls the functions of api/, always on the memory store.
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

process.env.SECRET_SANTA_STORE = "memory";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT ?? 3000);

/** @type {{ headers: { source: string, headers: { key: string, value: string }[] }[] }} */
const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
const headerRules = vercel.headers.map((rule) => ({
  pattern: new RegExp(
    `^${rule.source
      .split("(.*)")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  ),
  headers: rule.headers,
}));

/** @type {Record<string, string>} */
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/**
 * The headers that vercel.json sets on a path.
 * @param {string} path
 */
function headersFor(path) {
  const rules = headerRules.filter((rule) => rule.pattern.test(path));
  return Object.fromEntries(rules.flatMap((rule) => rule.headers.map((h) => [h.key, h.value])));
}

/**
 * The file of public/ that a path serves, with clean URLs, or null.
 * @param {string} path
 */
async function staticFile(path) {
  const relative = path.endsWith("/") ? `${path}index.html` : path;
  const file = join(publicDir, extname(relative) ? relative : `${relative}.html`);
  if (!file.startsWith(publicDir + sep)) return null;
  const info = await stat(file).catch(() => null);
  return info?.isFile() ? file : null;
}

/**
 * Calls the function of api/<name>.js for the request.
 * @param {string} name
 * @param {import("node:http").IncomingMessage} req
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function callFunction(name, req, url) {
  const notFound = Response.json({ error: "not_found" }, { status: 404 });
  if (!/^[a-z-]+$/.test(name)) return notFound;
  const file = join(root, "api", `${name}.js`);
  if (!(await stat(file).catch(() => null))) return notFound;
  /** @type {Record<string, unknown>} */
  const module = await import(file);
  const handler = module[req.method ?? "GET"];
  if (typeof handler !== "function") return new Response(null, { status: 405 });
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  /** @type {RequestInit & { duplex?: "half" }} */
  const init = {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([key, value]) =>
      [value ?? []].flat().map((item) => /** @type {[string, string]} */ ([key, item])),
    ),
    body: hasBody ? /** @type {ReadableStream} */ (Readable.toWeb(req)) : undefined,
    duplex: hasBody ? "half" : undefined,
  };
  return handler(new Request(url, init));
}

/**
 * The answer to a request.
 * @param {import("node:http").IncomingMessage} req
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function respond(req, url) {
  const notFound = new Response("Not found", { status: 404 });
  const path = decodeURIComponent(url.pathname);
  if (path.includes("\0") || path.split("/").includes("..")) return notFound;
  if (path.startsWith("/api/")) return callFunction(path.slice("/api/".length), req, url);
  const file = await staticFile(path);
  if (!file) return notFound;
  return new Response(await readFile(file), {
    headers: { "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream" },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const response = await respond(req, url).catch(() =>
    Response.json({ error: "internal" }, { status: 500 }),
  );
  const headers = { ...Object.fromEntries(response.headers), ...headersFor(url.pathname) };
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`http://localhost:${port}`);
});
