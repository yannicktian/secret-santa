import { expect, test } from "@playwright/test";

test("the home page opens without horizontal scroll", async ({ page }, testInfo) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page).toHaveTitle("Secret santa de Noël");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Secret santa de Noël");

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(testInfo.project.use.viewport?.width);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  if (process.env.CAPTURES) {
    await page.screenshot({ path: `captures/socle-accueil-${testInfo.project.name}.png` });
  }
});

test("the security headers of vercel.json are served", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex");
});

test("the health of the local server uses the memory store", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ ok: true, store: "memory", reservedPage: true });
});

test("files outside public/ are not served", async ({ request }) => {
  for (const path of [
    "/package.json",
    "/lib/http.js",
    "/../package.json",
    "/%2e%2e/package.json",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
