import { expect, test } from "@playwright/test";

const firstTime =
  "C'est ta première visite. Choisis un mot de passe : il te servira à revoir ton tirage plus tard.";
const advice =
  "Prends-en un simple, facile à retenir : le nom d'un animal, d'une ville, d'un plat.";
const tooShort = "Il faut au moins 4 lettres ou chiffres.";
const help = "Majuscules ou minuscules : peu importe.";
const forgot =
  "Mot de passe oublié ? Demande à Yannick de l'effacer : tu en choisiras un nouveau, et ton tirage ne changera pas.";
const forgotYannick = "Mot de passe oublié ? Efface-le depuis la page réservée.";
const wrong = "Ce n'est pas le bon mot de passe. Réessaie.";
const locked = "Beaucoup d'essais ratés : attends une minute avant de réessayer.";
const offline = "Oups, le site ne répond pas. Vérifie ta connexion à internet, puis réessaie.";

/** The name drawn in these tests: fictitious. */
const receiver = "Anne";

/**
 * @typedef {{ status?: number, json: unknown } | "offline"} Answer
 * @typedef {{ path: string, body: any }} Call
 */

/**
 * Opens the screen of the password of a participant, with every call intercepted: each
 * function answers in turn with the answers given for it, the last one again once used up.
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 * @param {{ hasPassword: boolean, choose?: Answer[], open?: Answer[] }} answers
 */
async function openPassword(page, name, { hasPassword, choose = [], open = [] }) {
  /** @type {Call[]} */
  const calls = [];
  /** @type {Record<string, Answer[]>} */
  const queues = {
    "/api/participant": [{ json: { hasPassword } }],
    "/api/choose-password": choose,
    "/api/open-gift": open,
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push({ path, body: route.request().postDataJSON() });
    const queue = queues[path] ?? [];
    const answer = queue.length > 1 ? queue.shift() : queue[0];
    if (!answer) return route.fulfill({ status: 500, json: { error: "internal" } });
    if (answer === "offline") return route.abort("internetdisconnected");
    return route.fulfill({ status: answer.status ?? 200, json: answer.json });
  });
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00+01:00"));
  await page.goto("/");
  await page.getByRole("button", { name }).click();
  await expect(page.locator(".hello")).toHaveText(`Bonjour ${name} !`);
  return calls;
}

/** @param {Call[]} calls */
function writes(calls) {
  return calls.filter((c) => c.path !== "/api/participant");
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
function capture(page, name) {
  if (!process.env.CAPTURES) return;
  return page.screenshot({ path: `captures/${name}.png`, fullPage: true });
}

/**
 * The texts of the screen in order, in the elements of the screen.
 * @param {import("@playwright/test").Page} page
 */
async function texts(page) {
  return page
    .locator("main")
    .locator("p, label, button, input")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n instanceof HTMLInputElement ? "<champ>" : (n.textContent ?? ""))),
    );
}

/**
 * The checks of each state at 360 pixels: no horizontal scroll, each element to touch of at
 * least 48 pixels, each button of at least 56 pixels high, running text of at least 20 pixels,
 * and the same rendering in the dark theme.
 * @param {import("@playwright/test").Page} page
 */
async function checkLayout(page) {
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    touch: [...document.querySelectorAll("main button, main input")].map((n) => {
      const r = n.getBoundingClientRect();
      return { text: n.textContent, width: r.width, height: r.height, btn: n.matches(".btn") };
    }),
    fonts: [...document.querySelectorAll("main p, main label, main input")].map((n) =>
      Number.parseFloat(getComputedStyle(n).fontSize),
    ),
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.innerWidth);
  for (const box of sizes.touch) {
    expect(box.width, box.text ?? "").toBeGreaterThanOrEqual(48);
    expect(box.height, box.text ?? "").toBeGreaterThanOrEqual(box.btn ? 56 : 48);
  }
  for (const size of sizes.fonts) expect(size).toBeGreaterThanOrEqual(20);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").evaluate((main) => {
    for (const input of main.querySelectorAll("input")) input.blur();
  });
  const light = await page.screenshot({ animations: "disabled", caret: "hide" });
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.screenshot({ animations: "disabled", caret: "hide" });
  await page.emulateMedia({ colorScheme: "light" });
  expect(dark.equals(light)).toBe(true);
}

test.describe("S2, first time", () => {
  test("the elements of S2, in order, with the exact words", async ({ page }, testInfo) => {
    await openPassword(page, "Léa", { hasPassword: false });
    expect(await texts(page)).toEqual([
      "Bonjour Léa !",
      firstTime,
      advice,
      "Ton mot de passe",
      "<champ>",
      "Valider",
      "Ce n'est pas moi",
    ]);
    const field = page.getByLabel("Ton mot de passe");
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveAttribute("autocapitalize", "none");
    await expect(field).toHaveAttribute("autocorrect", "off");
    await expect(field).toHaveAttribute("spellcheck", "false");
    await expect(field).toHaveAttribute("autocomplete", "off");
    await checkLayout(page);
    await capture(page, `mdp-premiere-fois-${testInfo.project.name}`);
  });

  test("less than 4 characters: the message, and what was typed stays", async ({
    page,
  }, testInfo) => {
    const calls = await openPassword(page, "Léa", { hasPassword: false });
    const field = page.getByLabel("Ton mot de passe");
    for (const typed of ["abc", "  ab  "]) {
      await field.fill(typed);
      await page.getByRole("button", { name: "Valider" }).click();
      await expect(page.locator(".error")).toHaveText(tooShort);
      await expect(field).toHaveValue(typed);
    }
    expect(writes(calls)).toEqual([]);
    await checkLayout(page);
    await capture(page, `mdp-trop-court-${testInfo.project.name}`);
  });

  test("« Valider » saves the password and opens the gift without asking again", async ({
    page,
  }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: false,
      choose: [{ json: { receiver } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByLabel("Ton mot de passe")).toHaveCount(0);
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByText("Qui es-tu ?")).toHaveCount(0);
    await expect(page.getByText("Ton tirage est dans ce paquet.")).toBeVisible();
    expect(writes(calls)).toEqual([
      { path: "/api/choose-password", body: { participant: "lea", password: "Renne" } },
    ]);
  });

  test("the Enter key sends too", async ({ page }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: false,
      choose: [{ json: { receiver } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByLabel("Ton mot de passe").press("Enter");
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByText("Qui es-tu ?")).toHaveCount(0);
    expect(writes(calls)).toHaveLength(1);
  });

  test("« Ce n'est pas moi » comes back home without any write", async ({ page }) => {
    const calls = await openPassword(page, "Léa", { hasPassword: false });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Ce n'est pas moi" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
    expect(writes(calls)).toEqual([]);
  });

  test("already_chosen: S3 with an empty field", async ({ page }) => {
    await openPassword(page, "Léa", {
      hasPassword: false,
      choose: [{ status: 409, json: { error: "already_chosen" } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("button", { name: "Voir mon tirage" })).toBeVisible();
    await expect(page.getByText(help)).toBeVisible();
    await expect(page.getByLabel("Ton mot de passe")).toHaveValue("");
    await expect(page.locator(".hello")).toHaveText("Bonjour Léa !");
  });

  test("locked: the message of the failed attempts", async ({ page }) => {
    await openPassword(page, "Léa", {
      hasPassword: false,
      choose: [{ status: 429, json: { error: "locked" } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.locator(".error")).toHaveText(locked);
    await checkLayout(page);
  });

  test("too_short from the server: the message, and what was typed stays", async ({ page }) => {
    await openPassword(page, "Léa", {
      hasPassword: false,
      choose: [{ status: 422, json: { error: "too_short" } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.locator(".error")).toHaveText(tooShort);
    await expect(page.getByLabel("Ton mot de passe")).toHaveValue("Renne");
  });

  test("site unreachable at « Valider »: banner, « Réessayer » sends again, the field keeps the text", async ({
    page,
  }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: false,
      choose: ["offline", { json: { receiver } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.locator(".banner")).toContainText(offline);
    await expect(page.getByLabel("Ton mot de passe")).toHaveValue("Renne");
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByText("Qui es-tu ?")).toHaveCount(0);
    expect(writes(calls)).toEqual([
      { path: "/api/choose-password", body: { participant: "lea", password: "Renne" } },
      { path: "/api/choose-password", body: { participant: "lea", password: "Renne" } },
    ]);
  });

  test("a late answer of « Valider » does not replace the home page", async ({ page }) => {
    await openPassword(page, "Léa", { hasPassword: false });
    await page.route("**/api/choose-password", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.fulfill({ json: { receiver } });
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Valider" }).click();
    await page.getByRole("button", { name: "Ce n'est pas moi" }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  });
});

test.describe("S3, back again", () => {
  test("the elements of S3, in order, with the forgotten password from the start", async ({
    page,
  }, testInfo) => {
    await openPassword(page, "Léa", { hasPassword: true });
    expect(await texts(page)).toEqual([
      "Bonjour Léa !",
      "Ton mot de passe",
      "<champ>",
      help,
      "Voir mon tirage",
      forgot,
      "Ce n'est pas moi",
    ]);
    const field = page.getByLabel("Ton mot de passe");
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveAttribute("autocapitalize", "none");
    await expect(field).toHaveAttribute("autocorrect", "off");
    await expect(field).toHaveAttribute("spellcheck", "false");
    await checkLayout(page);
    await capture(page, `mdp-retour-${testInfo.project.name}`);
  });

  test("for Yannick, the text of the forgotten password sends to the reserved page", async ({
    page,
  }, testInfo) => {
    await openPassword(page, "Yannick", { hasPassword: true });
    await expect(page.getByText(forgotYannick)).toBeVisible();
    await expect(page.getByText(forgot)).toHaveCount(0);
    await checkLayout(page);
    await capture(page, `mdp-retour-yannick-${testInfo.project.name}`);
  });

  test("a good password opens the gift", async ({ page }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: true,
      open: [{ json: { receiver } }],
    });
    await page.getByLabel("Ton mot de passe").fill("RENNE");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByText("Qui es-tu ?")).toHaveCount(0);
    expect(writes(calls)).toEqual([
      { path: "/api/open-gift", body: { participant: "lea", password: "RENNE" } },
    ]);
  });

  test("wrong_password empties the field and shows the message", async ({ page }, testInfo) => {
    await openPassword(page, "Léa", {
      hasPassword: true,
      open: [{ status: 401, json: { error: "wrong_password" } }],
    });
    const field = page.getByLabel("Ton mot de passe");
    await field.fill("Caribou");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator(".error")).toHaveText(wrong);
    await expect(field).toHaveValue("");
    await expect(page.getByText(forgot)).toBeVisible();
    await checkLayout(page);
    await capture(page, `mdp-mauvais-${testInfo.project.name}`);
  });

  test("locked shows the message of the failed attempts", async ({ page }, testInfo) => {
    await openPassword(page, "Léa", {
      hasPassword: true,
      open: [{ status: 429, json: { error: "locked" } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Caribou");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator(".error")).toHaveText(locked);
    await checkLayout(page);
    await capture(page, `mdp-bloque-${testInfo.project.name}`);
  });

  test("no_password: S2", async ({ page }) => {
    await openPassword(page, "Léa", {
      hasPassword: true,
      open: [{ status: 409, json: { error: "no_password" } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Caribou");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.getByText(firstTime)).toBeVisible();
    await expect(page.getByRole("button", { name: "Valider" })).toBeVisible();
    await expect(page.getByLabel("Ton mot de passe")).toHaveValue("");
  });

  test("site unreachable at « Voir mon tirage »: banner, « Réessayer » sends again, the field keeps the text", async ({
    page,
  }, testInfo) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: true,
      open: ["offline", { json: { receiver } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator(".banner")).toContainText(offline);
    await expect(page.getByLabel("Ton mot de passe")).toHaveValue("Renne");
    if (process.env.CAPTURES) {
      await page.screenshot({ path: `captures/mdp-injoignable-${testInfo.project.name}.png` });
    }
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByText("Qui es-tu ?")).toHaveCount(0);
    expect(writes(calls)).toHaveLength(2);
  });
});

test.describe("one call at a time", () => {
  /**
   * Holds the answers of a function for 800 ms, so that a second tap comes while one is
   * awaited.
   * @param {import("@playwright/test").Page} page
   * @param {string} path
   */
  async function slow(page, path) {
    await page.route(`**${path}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fallback();
    });
  }

  test("a double tap on « Voir mon tirage » makes one call, so one failed attempt", async ({
    page,
  }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: true,
      open: [{ status: 401, json: { error: "wrong_password" } }],
    });
    await slow(page, "/api/open-gift");
    await page.getByLabel("Ton mot de passe").fill("Caribou");
    await page.getByRole("button", { name: "Voir mon tirage" }).dblclick();
    await page.getByLabel("Ton mot de passe").press("Enter");
    await expect(page.locator(".error")).toHaveText(wrong);
    await page.waitForTimeout(1000);
    expect(writes(calls)).toEqual([
      { path: "/api/open-gift", body: { participant: "lea", password: "Caribou" } },
    ]);
  });

  test("a double tap on « Valider » makes one call", async ({ page }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: false,
      choose: [{ status: 429, json: { error: "locked" } }],
    });
    await slow(page, "/api/choose-password");
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Valider" }).dblclick();
    await expect(page.locator(".error")).toHaveText(locked);
    await page.waitForTimeout(1000);
    expect(writes(calls)).toHaveLength(1);
  });

  test("once the answer is there, the button sends again", async ({ page }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: true,
      open: [{ status: 401, json: { error: "wrong_password" } }, { json: { receiver } }],
    });
    await page.getByLabel("Ton mot de passe").fill("Caribou");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator(".error")).toHaveText(wrong);
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByText("Qui es-tu ?")).toHaveCount(0);
    expect(writes(calls)).toHaveLength(2);
  });

  test("with the banner, the button sends again, and « Réessayer » still works", async ({
    page,
  }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: true,
      open: ["offline", "offline", { json: { receiver } }],
    });
    await slow(page, "/api/open-gift");
    await page.getByLabel("Ton mot de passe").fill("Renne");
    await page.getByRole("button", { name: "Voir mon tirage" }).dblclick();
    await expect(page.locator(".banner")).toContainText(offline);
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator(".banner")).toContainText(offline);
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByText("Qui es-tu ?")).toHaveCount(0);
    expect(writes(calls)).toHaveLength(3);
  });

  test("an answer still awaited from a previous visit of the screen does not block it", async ({
    page,
  }) => {
    const calls = await openPassword(page, "Léa", {
      hasPassword: true,
      open: [{ status: 401, json: { error: "wrong_password" } }],
    });
    await slow(page, "/api/open-gift");
    await page.getByLabel("Ton mot de passe").fill("Caribou");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await page.getByRole("button", { name: "Ce n'est pas moi" }).click();
    await page.getByRole("button", { name: "Léa" }).click();
    await page.getByLabel("Ton mot de passe").fill("Caribou");
    await page.getByRole("button", { name: "Voir mon tirage" }).click();
    await expect(page.locator(".error")).toHaveText(wrong);
    expect(writes(calls)).toHaveLength(2);
  });
});

test("keyboard open (360 × 340): the field and the button stay visible after touching the field", async ({
  page,
}) => {
  for (const [hasPassword, name, button] of [
    [false, "Mamet", "Valider"],
    [true, "Christine", "Voir mon tirage"],
  ]) {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.unrouteAll();
    await openPassword(page, String(name), { hasPassword: Boolean(hasPassword) });
    await page.setViewportSize({ width: 360, height: 340 });
    await page.getByLabel("Ton mot de passe").click();
    await expect(page.getByLabel("Ton mot de passe")).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: String(button) })).toBeInViewport({ ratio: 1 });
  }
});
