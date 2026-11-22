import { expect, test } from "@playwright/test";

// The draws and passwords of these tests are fictitious; the calls are intercepted.

const names = ["Yannick", "Léa", "Christine", "Guigui", "Mamet", "Anne", "Loulou"];
const closedText = "Ton tirage est dans ce paquet.";
const hint = "Touche le paquet pour l'ouvrir.";
const to = "Tu offres ton cadeau à";
const reminder = "Garde le secret jusqu'au 25 décembre !";
const back = "Retour à l'accueil";

/**
 * Opens the gift screen of Léa, with a fictitious name drawn.
 * @param {import("@playwright/test").Page} page
 * @param {string} receiver
 */
async function openGift(page, receiver = "Christine") {
  await page.route("**/api/participants", (route) =>
    route.fulfill({ json: { hasPassword: { lea: true } } }),
  );
  await page.route("**/api/participant", (route) => route.fulfill({ json: { hasPassword: true } }));
  await page.route("**/api/open-gift", (route) => route.fulfill({ json: { receiver } }));
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00+01:00"));
  await page.goto("/");
  await chooseLea(page);
}

/**
 * From the home page, Léa gives her password: the gift screen is shown.
 * @param {import("@playwright/test").Page} page
 */
async function chooseLea(page) {
  await page.getByRole("button", { name: "Léa" }).click();
  await page.getByLabel("Ton mot de passe").fill("Renne");
  await page.getByRole("button", { name: "Voir mon tirage" }).click();
  await expect(page.getByText(closedText)).toBeVisible();
}

/** @param {import("@playwright/test").Page} page */
function gift(page) {
  return page.locator("button.giftbtn");
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
async function capture(page, name) {
  if (!process.env.CAPTURES) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `captures/${name}.png`, fullPage: true });
}

/** @param {import("@playwright/test").Page} page */
async function noHorizontalScroll(page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/**
 * @param {import("@playwright/test").Locator} locator
 */
async function fontSize(locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

test("closed: the two sentences and the gift, clickable on its whole surface", async ({
  page,
}, testInfo) => {
  await openGift(page);
  const text = (await page.locator("main").textContent()) ?? "";
  expect(text.indexOf(closedText)).toBeLessThan(text.indexOf(hint));
  await expect(page.getByText(to)).toHaveCount(0);
  await expect(page.getByText("Christine")).toHaveCount(0);
  await expect(gift(page)).toHaveAccessibleName(hint);
  await noHorizontalScroll(page);
  const box = await gift(page).boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(48);
  expect(box?.height).toBeGreaterThanOrEqual(48);
  for (const words of [closedText, hint]) {
    expect(await fontSize(page.getByText(words))).toBeGreaterThanOrEqual(20);
  }
  const covered = await gift(page).evaluate((element) => {
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
  await capture(page, `paquet-ferme-${testInfo.project.name}`);
  await gift(page).click({ position: { x: 2, y: 2 } });
  await expect(page.getByText(to)).toBeVisible();
});

test("opened: the name drawn, the reminder and « Retour à l'accueil », in order", async ({
  page,
}, testInfo) => {
  /** @type {string[]} */
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await openGift(page);
  await gift(page).click();
  await expect(page.locator(".name")).toHaveText("Christine");
  await expect(page.locator(".name")).toBeVisible();
  const text = (await page.locator("main").textContent()) ?? "";
  const order = [to, "Christine", reminder, back];
  const positions = order.map((part) => text.indexOf(part));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  await expect(page.getByText(closedText)).toHaveCount(0);
  await noHorizontalScroll(page);
  const button = page.getByRole("button", { name: back });
  const box = await button.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(48);
  expect(box?.height).toBeGreaterThanOrEqual(56);
  for (const words of [to, reminder]) {
    expect(await fontSize(page.getByText(words))).toBeGreaterThanOrEqual(20);
  }
  expect(await fontSize(page.locator(".name"))).toBeGreaterThan(20);
  await page.waitForTimeout(1300);
  await capture(page, `paquet-ouvert-${testInfo.project.name}`);
  expect(errors).toEqual([]);
});

test("no text says who gives a gift to the person", async ({ page }) => {
  await openGift(page, "Zoé");
  const closed = (await page.locator("main").textContent()) ?? "";
  expect(closed).toBe(closedText + hint);
  await gift(page).click();
  await expect(page.locator(".name")).toHaveText("Zoé");
  expect(await page.locator("main").textContent()).toBe(`${to}Zoé${reminder}${back}`);
  expect(((await page.locator("body").textContent()) ?? "").replace(/\s+/g, "")).toBe(
    `${to}Zoé${reminder}${back}`.replace(/\s+/g, ""),
  );
  for (const name of names) expect(await page.content()).not.toContain(name);
});

test("with less motion asked, the gift opens at once, without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGift(page);
  const state = await gift(page).evaluate((element) => {
    /** @type {HTMLElement} */ (element).click();
    return {
      text: document.querySelector("main")?.textContent,
      confetti: document.querySelectorAll(".confetti").length,
      animations: document.getAnimations().filter((animation) => animation.playState === "running")
        .length,
    };
  });
  expect(state.text).toBe(`${to}Christine${reminder}${back}`);
  expect(state.confetti).toBe(0);
  expect(state.animations).toBe(0);
});

test("with motion, the lid opens and confetti fly before the name is shown", async ({ page }) => {
  await openGift(page);
  await gift(page).click();
  await expect(page.locator("button.giftbtn.open")).toHaveCount(1);
  await expect(page.locator(".confetti").first()).toBeAttached();
  await expect(page.getByText(to)).toBeVisible();
  await expect(page.locator(".confetti")).toHaveCount(0);
});

test("« Retour à l'accueil » comes back home and the name is no longer in the page", async ({
  page,
}) => {
  await openGift(page, "Zoé");
  await gift(page).click();
  await page.getByRole("button", { name: back }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  expect(await page.content()).not.toContain("Zoé");
});

test("leaving before the end of the animation does not show the gift opened", async ({ page }) => {
  await openGift(page, "Zoé");
  await gift(page).click();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await page.waitForTimeout(1300);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  expect(await page.content()).not.toContain("Zoé");
});

test("no history entry; back then forward, or reload, shows the home page", async ({ page }) => {
  await openGift(page, "Zoé");
  const before = await page.evaluate(() => history.length);
  await gift(page).click();
  await expect(page.getByText(to)).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before);
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  expect(await page.content()).not.toContain("Zoé");

  await chooseLea(page);
  await gift(page).click();
  await expect(page.getByText(to)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  expect(await page.content()).not.toContain("Zoé");
});

test("the dark theme of the device changes nothing, closed and opened", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGift(page);
  for (const step of ["closed", "opened"]) {
    if (step === "opened") await gift(page).click();
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ colorScheme: "light" });
    const light = await page.screenshot({ animations: "disabled" });
    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await page.screenshot({ animations: "disabled" });
    expect(dark.equals(light), step).toBe(true);
  }
});
