import { expect, test } from "@playwright/test";

const names = ["Yannick", "Léa", "Christine", "Guigui", "Mamet", "Anne", "Loulou"];
const title = "Secret santa de Noël";
const presentation =
  "Cette année, chacun offre un cadeau à une personne tirée au sort. Chut : personne ne sait qui lui offre le sien !";
const date = "Rendez-vous le 25 décembre à midi.";
const offline = "Oups, le site ne répond pas. Vérifie ta connexion à internet, puis réessaie.";

/**
 * Opens the home page on a day in Paris, with POST /api/participant intercepted.
 * @param {import("@playwright/test").Page} page
 * @param {string} day
 * @param {{ hasPassword?: boolean }} [answer]
 */
async function openHome(page, day = "2026-11-22", answer = { hasPassword: false }) {
  /** @type {unknown[]} */
  const calls = [];
  await page.route("**/api/participant", (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: answer });
  });
  await page.clock.setFixedTime(new Date(`${day}T10:00:00+01:00`));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  return calls;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 * @param {boolean} [fullPage] false to keep the banner at the bottom of the screen
 */
function capture(page, name, fullPage = true) {
  if (!process.env.CAPTURES) return;
  return page.screenshot({ path: `captures/${name}.png`, fullPage });
}

test("the home page shows the elements of S1, in order, with the exact words", async ({ page }) => {
  await openHome(page);
  const text = (await page.locator("main").textContent()) ?? "";
  const order = [title, presentation, date, "Plus que 33 jours !", "Qui es-tu ?", ...names];
  const positions = order.map((part) => text.indexOf(part));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
});

test("the countdown follows the day in Paris", async ({ page }, testInfo) => {
  for (const [day, words] of [
    ["2026-11-22", "Plus que 33 jours !"],
    ["2026-12-24", "C'est demain !"],
    ["2026-12-25", "C'est aujourd'hui !"],
  ]) {
    await page.clock.setFixedTime(new Date(`${day}T10:00:00+01:00`));
    await page.goto("/");
    await expect(page.getByText(words)).toBeVisible();
    await expect(page.getByText(date)).toBeVisible();
    await capture(page, `accueil-${day}-${testInfo.project.name}`);
  }
});

test("from December 26th, neither the date nor the countdown is shown", async ({
  page,
}, testInfo) => {
  await openHome(page, "2026-12-26");
  await expect(page.getByText(presentation)).toBeVisible();
  await expect(page.getByText(date)).toHaveCount(0);
  await expect(page.getByText(/Plus que|C'est demain|C'est aujourd'hui/)).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(7);
  await capture(page, `accueil-2026-12-26-${testInfo.project.name}`);
});

test("seven buttons, in order, at least 56 pixels high, clickable on their whole surface", async ({
  page,
}) => {
  const calls = await openHome(page);
  const buttons = page.getByRole("button");
  await expect(buttons).toHaveCount(7);
  for (const [i, name] of names.entries()) {
    await expect(buttons.nth(i)).toHaveAccessibleName(name);
  }
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(56);
    await button.scrollIntoViewIfNeeded();
    const covered = await button.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const corners = [
        [r.left + 1, r.top + 1],
        [r.right - 2, r.top + 1],
        [r.left + 1, r.bottom - 2],
        [r.right - 2, r.bottom - 2],
      ];
      return corners.every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
    });
    expect(covered).toBe(true);
  }
  await buttons.nth(1).click({ position: { x: 2, y: 2 } });
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  expect(calls).toEqual([{ participant: "lea" }]);
});

test("title, presentation and question fit in the first screen of a 360 × 640 phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openHome(page);
  const box = await page.getByRole("heading", { level: 2 }).boundingBox();
  expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(640);
});

test("no link of the home page leads to the reserved page", async ({ page }) => {
  await openHome(page);
  await expect(page.locator("a")).toHaveCount(0);
  expect(await page.content()).not.toContain("reservee");
});

test("no horizontal scroll and running text of at least 20 pixels", async ({ page }) => {
  await openHome(page);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  for (const text of [presentation, date]) {
    const size = await page
      .getByText(text)
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(size).toBeGreaterThanOrEqual(20);
  }
});

test("the dark theme of the device changes nothing", async ({ page }) => {
  await openHome(page);
  await page.evaluate(() => document.fonts.ready);
  const light = await page.screenshot({ animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.screenshot({ animations: "disabled" });
  expect(dark.equals(light)).toBe(true);
});

test("site unreachable: banner, then « Réessayer » makes the call again", async ({
  page,
}, testInfo) => {
  let attempts = 0;
  await page.route("**/api/participant", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.abort("internetdisconnected")
      : route.fulfill({ json: { hasPassword: true } });
  });
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00+01:00"));
  await page.goto("/");
  await page.getByRole("button", { name: "Léa" }).click();
  const banner = page.getByRole("alert");
  await expect(banner).toContainText(offline);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  await capture(page, `accueil-injoignable-${testInfo.project.name}`, false);
  const retry = page.getByRole("button", { name: "Réessayer" });
  const box = await retry.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(56);
  await retry.click();
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  await expect(banner).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("a server error or an unexpected answer shows the banner too", async ({ page }) => {
  for (const status of [500, 404, 400]) {
    await page.unrouteAll();
    await page.route("**/api/participant", (route) =>
      route.fulfill({ status, json: { error: "internal" } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Mamet" }).click();
    await expect(page.getByRole("alert")).toContainText(offline);
  }
});

test("« Ce n'est pas moi » comes back home; nothing is kept on the device", async ({
  page,
  context,
}) => {
  await openHome(page);
  await page.getByRole("button", { name: "Guigui" }).click();
  await expect(page.getByText("Bonjour Guigui !")).toBeVisible();
  await page.getByRole("button", { name: "Ce n'est pas moi" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  expect(await context.cookies()).toEqual([]);
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
  }));
  expect(stored).toEqual({ local: 0, session: 0, databases: 0 });
  expect(await page.evaluate(() => history.length)).toBe(2);
});

test("a late answer does not replace a newer screen", async ({ page }) => {
  await page.route("**/api/participant", async (route) => {
    if (route.request().postDataJSON().participant === "lea") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return route.fulfill({ json: { hasPassword: false } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Léa" }).click();
  await page.getByRole("button", { name: "Mamet" }).click();
  await expect(page.getByText("Bonjour Mamet !")).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.locator(".hello")).toHaveText("Bonjour Mamet !");
});

test("after a second failure, the focus is on « Réessayer »", async ({ page }) => {
  await page.route("**/api/participant", (route) => route.abort("internetdisconnected"));
  await page.goto("/");
  await page.getByRole("button", { name: "Léa" }).click();
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeFocused();
});
