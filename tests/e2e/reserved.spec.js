import { expect, test } from "@playwright/test";

// The page réservée (S6, S8), with POST /api/reserved intercepted as the table of the functions
// of docs/architecture.md says. The administration password is fictitious.
const adminPassword = "flocon-fictif";
const names = ["Yannick", "Léa", "Christine", "Guigui", "Mamet", "Anne", "Loulou"];
const ids = ["yannick", "lea", "christine", "guigui", "mamet", "anne", "loulou"];
const wrong = "Ce n'est pas le bon mot de passe.";
const locked = "Beaucoup d'essais ratés : attends une minute avant de réessayer.";
const reminder = "Les tirages ne s'affichent jamais ici, pas même le tien.";
const offline = "Oups, le site ne répond pas. Vérifie ta connexion à internet, puis réessaie.";

/**
 * Intercepts POST /api/reserved with a fictitious state: by default, Yannick, Léa and Mamet
 * have chosen their password. `answer` can replace the answer of one call, by its number
 * from 1.
 * @param {import("@playwright/test").Page} page
 * @param {(n: number, body: any) => "abort" | { status: number, json: unknown } | undefined} [answer]
 * @param {string[]} [initial] The ids of the participants who have chosen their password.
 */
async function mockReserved(page, answer = () => undefined, initial = ["yannick", "lea", "mamet"]) {
  /** @type {any[]} */
  const calls = [];
  const chosen = new Set(initial);
  await page.route("**/api/reserved", (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const special = answer(calls.length, body);
    if (special === "abort") return route.abort("internetdisconnected");
    if (special) return route.fulfill(special);
    if (body.password !== adminPassword) {
      return route.fulfill({ status: 401, json: { error: "wrong_password" } });
    }
    if (body.action === "erase") chosen.delete(body.participant);
    if (body.action === "redraw") chosen.clear();
    const participants = ids.map((id, i) => ({ id, name: names[i], hasPassword: chosen.has(id) }));
    return route.fulfill({ json: { participants } });
  });
  return calls;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 * @param {boolean} [fullPage] false to keep the banner at the bottom of the screen
 */
async function capture(page, name, fullPage = true) {
  if (!process.env.CAPTURES) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `captures/${name}.png`, fullPage, animations: "disabled" });
}

/**
 * The rules of « Affichage » in the current state: no horizontal scroll, every element to
 * touch at least 48 pixels wide and high, every button at least 56 pixels high, running text
 * of at least 20 pixels, same rendering with the dark theme of the device.
 * @param {import("@playwright/test").Page} page
 * @param {string[]} texts The running texts of the state.
 */
async function checkDisplay(page, texts) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  for (const target of await page.locator("button, input").all()) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
  for (const button of await page.getByRole("button").all()) {
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(56);
  }
  for (const text of texts) {
    const size = await page
      .getByText(text, { exact: true })
      .first()
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(size, text).toBeGreaterThanOrEqual(20);
  }
  await page.evaluate(() => document.fonts.ready);
  const light = await page.screenshot({ animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.screenshot({ animations: "disabled" });
  await page.emulateMedia({ colorScheme: "light" });
  expect(dark.equals(light)).toBe(true);
}

/**
 * Opens the page and enters the administration password.
 * @param {import("@playwright/test").Page} page
 * @param {string} [password]
 */
async function enter(page, password = adminPassword) {
  await page.goto("/reservee");
  await page.getByLabel("Mot de passe d'administration").fill(password);
  await page.getByRole("button", { name: "Entrer" }).click();
}

test("/reservee asks for the administration password, in a hidden field", async ({
  page,
}, testInfo) => {
  const calls = await mockReserved(page);
  const response = await page.goto("/reservee");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page).toHaveTitle("Page réservée");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page réservée");
  const field = page.getByLabel("Mot de passe d'administration");
  await expect(field).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Entrer" })).toBeVisible();
  expect(calls).toEqual([]);
  await checkDisplay(page, ["Mot de passe d'administration"]);
  await capture(page, `reservee-mot-de-passe-${testInfo.project.name}`);
});

test("a wrong password, then too many failures, with the exact words", async ({
  page,
}, testInfo) => {
  const calls = await mockReserved(page, (n) =>
    n === 2 ? { status: 429, json: { error: "locked" } } : undefined,
  );
  await enter(page, "pas-le-bon");
  await expect(page.getByRole("alert")).toHaveText(wrong);
  await expect(page.getByLabel("Mot de passe d'administration")).toHaveValue("pas-le-bon");
  await checkDisplay(page, [wrong]);
  await capture(page, `reservee-mauvais-${testInfo.project.name}`);
  await page.getByRole("button", { name: "Entrer" }).click();
  await expect(page.getByRole("alert")).toHaveText(locked);
  await checkDisplay(page, [locked]);
  await capture(page, `reservee-bloquee-${testInfo.project.name}`);
  expect(calls).toEqual([
    { password: "pas-le-bon", action: "list" },
    { password: "pas-le-bon", action: "list" },
  ]);
  await expect(page.getByRole("heading", { name: "Participants" })).toHaveCount(0);
});

test("the list under « Participants », in order, with the state of each", async ({
  page,
}, testInfo) => {
  const calls = await mockReserved(page);
  await enter(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Participants");
  const rows = page.locator(".row");
  await expect(rows).toHaveCount(7);
  const chosen = ["Yannick", "Léa", "Mamet"];
  for (const [i, name] of names.entries()) {
    const row = rows.nth(i);
    await expect(row.locator(".n")).toHaveText(name);
    const has = chosen.includes(name);
    await expect(row.locator(".st")).toHaveText(
      has ? "Mot de passe choisi" : "Pas encore de mot de passe",
    );
    await expect(row.getByRole("button", { name: "Effacer le mot de passe" })).toHaveCount(
      has ? 1 : 0,
    );
  }
  await expect(page.getByText(reminder)).toBeVisible();
  expect(calls).toEqual([{ password: adminPassword, action: "list" }]);
  await checkDisplay(page, [
    reminder,
    "Mot de passe choisi",
    "Pas encore de mot de passe",
    ...names,
  ]);
  await capture(page, `reservee-liste-${testInfo.project.name}`);
});

test("« Annuler » calls nothing; « Effacer » erases with the password typed", async ({
  page,
}, testInfo) => {
  const calls = await mockReserved(page);
  await enter(page);
  const lea = page.locator(".row").nth(1);
  await lea.getByRole("button", { name: "Effacer le mot de passe" }).click();
  const question = "Effacer le mot de passe de Léa ?";
  const explanation = "Léa en choisira un nouveau à sa prochaine visite. Son tirage ne change pas.";
  await expect(page.getByText(question)).toBeVisible();
  await expect(page.getByText(explanation)).toBeVisible();
  await expect(page.getByRole("button", { name: "Effacer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler" })).toBeVisible();
  await checkDisplay(page, [question, explanation]);
  await capture(page, `reservee-confirmation-${testInfo.project.name}`);

  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
  await expect(lea.locator(".st")).toHaveText("Mot de passe choisi");
  expect(calls).toHaveLength(1);

  await lea.getByRole("button", { name: "Effacer le mot de passe" }).click();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  const done = "Mot de passe de Léa effacé.";
  await expect(page.getByRole("status")).toHaveText(done);
  await expect(lea.locator(".st")).toHaveText("Pas encore de mot de passe");
  await expect(lea.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(reminder)).toBeVisible();
  expect(calls).toEqual([
    { password: adminPassword, action: "list" },
    { password: adminPassword, action: "erase", participant: "lea" },
  ]);
  await checkDisplay(page, [done, reminder]);
  await capture(page, `reservee-efface-${testInfo.project.name}`);
});

/**
 * Holds the answers of POST /api/reserved for one action for 800 ms, so that a second tap
 * comes while one is awaited.
 * @param {import("@playwright/test").Page} page
 * @param {string} action
 */
async function slow(page, action) {
  await page.route("**/api/reserved", async (route) => {
    if (route.request().postDataJSON().action === action) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    return route.fallback();
  });
}

test("a double tap on « Entrer » makes one call", async ({ page }) => {
  const calls = await mockReserved(page);
  await slow(page, "list");
  await page.goto("/reservee");
  await page.getByLabel("Mot de passe d'administration").fill(adminPassword);
  await page.getByRole("button", { name: "Entrer" }).dblclick();
  await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(calls).toEqual([{ password: adminPassword, action: "list" }]);
});

test("a double tap on « Effacer » makes one call", async ({ page }) => {
  const calls = await mockReserved(page);
  await enter(page);
  await slow(page, "erase");
  await page
    .locator(".row")
    .nth(1)
    .getByRole("button", { name: "Effacer le mot de passe" })
    .click();
  await page.getByRole("button", { name: "Effacer", exact: true }).dblclick();
  await expect(page.getByRole("status")).toHaveText("Mot de passe de Léa effacé.");
  await page.waitForTimeout(1000);
  expect(calls.slice(1)).toEqual([
    { password: adminPassword, action: "erase", participant: "lea" },
  ]);
});

test("« Annuler » during an erasing: the list shows the answer received", async ({ page }) => {
  const calls = await mockReserved(page);
  await enter(page);
  await slow(page, "erase");
  const lea = page.locator(".row").nth(1);
  await lea.getByRole("button", { name: "Effacer le mot de passe" }).click();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("status")).toHaveText("Mot de passe de Léa effacé.");
  await expect(lea.locator(".st")).toHaveText("Pas encore de mot de passe");
  expect(calls).toHaveLength(2);
});

test("« Annuler » with the banner comes back to the list without any call", async ({ page }) => {
  const calls = await mockReserved(page, (n) => (n === 2 ? "abort" : undefined));
  await enter(page);
  const mamet = page.locator(".row").nth(4);
  await mamet.getByRole("button", { name: "Effacer le mot de passe" }).click();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(offline);
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(mamet.locator(".st")).toHaveText("Mot de passe choisi");
  expect(calls).toHaveLength(2);
});

test("the page shows neither a draw nor a password", async ({ page }) => {
  await mockReserved(page);
  await enter(page);
  await expect(page.locator(".row")).toHaveCount(7);
  const text = (await page.locator("main").textContent()) ?? "";
  expect(text).not.toContain(adminPassword);
  expect(text).not.toMatch(/offre|tiré/);
});

test("network cut at « Entrer »: banner, « Réessayer » makes the same call", async ({
  page,
}, testInfo) => {
  const calls = await mockReserved(page, (n) => (n === 1 ? "abort" : undefined));
  await enter(page);
  await expect(page.getByRole("alert")).toContainText(offline);
  await expect(page.getByLabel("Mot de passe d'administration")).toHaveValue(adminPassword);
  await checkDisplay(page, [offline]);
  await capture(page, `reservee-injoignable-entrer-${testInfo.project.name}`, false);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(calls).toEqual([
    { password: adminPassword, action: "list" },
    { password: adminPassword, action: "list" },
  ]);
});

test("network cut at « Effacer »: banner, « Réessayer » makes the same call", async ({
  page,
}, testInfo) => {
  const calls = await mockReserved(page, (n) => (n === 2 ? "abort" : undefined));
  await enter(page);
  await page
    .locator(".row")
    .nth(4)
    .getByRole("button", { name: "Effacer le mot de passe" })
    .click();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(offline);
  await expect(page.getByText("Effacer le mot de passe de Mamet ?")).toBeVisible();
  await checkDisplay(page, [offline]);
  await capture(page, `reservee-injoignable-effacer-${testInfo.project.name}`, false);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("status")).toHaveText("Mot de passe de Mamet effacé.");
  expect(calls.slice(1)).toEqual([
    { password: adminPassword, action: "erase", participant: "mamet" },
    { password: adminPassword, action: "erase", participant: "mamet" },
  ]);
});

test("a missing administration password on the server shows the banner", async ({ page }) => {
  await mockReserved(page, () => ({ status: 503, json: { error: "admin_password_missing" } }));
  await enter(page);
  await expect(page.getByRole("alert")).toContainText(offline);
  await expect(page.getByRole("heading", { name: "Participants" })).toHaveCount(0);
});

test("reloading asks for the password again; nothing is kept on the device", async ({
  page,
  context,
}) => {
  const calls = await mockReserved(page);
  await enter(page);
  await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
  expect(await context.cookies()).toEqual([]);
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
  }));
  expect(stored).toEqual({ local: 0, session: 0, databases: 0 });
  await page.reload();
  await expect(page.getByLabel("Mot de passe d'administration")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Participants" })).toHaveCount(0);
  expect(calls).toHaveLength(1);
});

const redoQuestion = "Refaire le tirage ?";
const redoExplanation =
  "Tous les mots de passe seront effacés : chacun en choisira un nouveau et découvrira un nouveau tirage.";
const redone = "Tirage refait. Chacun choisira un nouveau mot de passe.";

test("« Refaire le tirage » under the list; « Annuler » calls nothing; the redraw", async ({
  page,
}, testInfo) => {
  const calls = await mockReserved(page);
  await enter(page);
  const redo = page.getByRole("button", { name: "Refaire le tirage" });
  await expect(redo).toHaveCount(1);
  const below = await page
    .locator(".list")
    .evaluate(
      (list, button) => Boolean(list.compareDocumentPosition(/** @type {Node} */ (button)) & 4),
      await redo.elementHandle(),
    );
  expect(below).toBe(true);
  await redo.click();
  await expect(page.getByText(redoQuestion, { exact: true })).toBeVisible();
  await expect(page.getByText(redoExplanation)).toBeVisible();
  const seen = "3 personnes ont déjà vu leur tirage.";
  await expect(page.getByText(seen)).toBeVisible();
  await expect(page.locator("main p")).toHaveText([redoQuestion, redoExplanation, seen]);
  await expect(page.getByRole("button", { name: "Refaire le tirage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler" })).toBeVisible();
  await checkDisplay(page, [redoQuestion, redoExplanation, seen]);
  await capture(page, `reservee-refaire-confirmation-${testInfo.project.name}`);

  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
  await expect(page.locator(".row").nth(0).locator(".st")).toHaveText("Mot de passe choisi");
  expect(calls).toHaveLength(1);

  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await expect(page.getByRole("status")).toHaveText(redone);
  await expect(page.locator(".row .st")).toHaveText(names.map(() => "Pas encore de mot de passe"));
  await expect(page.getByRole("button", { name: "Effacer le mot de passe" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refaire le tirage" })).toBeVisible();
  await expect(page.getByText(reminder)).toBeVisible();
  expect(calls).toEqual([
    { password: adminPassword, action: "list" },
    { password: adminPassword, action: "redraw" },
  ]);
  await checkDisplay(page, [redone, reminder]);
  await capture(page, `reservee-refait-${testInfo.project.name}`);
});

test("the confirmation says « 1 personne… », or nothing when nobody has a password", async ({
  page,
}) => {
  await mockReserved(page, undefined, ["anne"]);
  await enter(page);
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await expect(page.locator("main p")).toHaveText([
    redoQuestion,
    redoExplanation,
    "1 personne a déjà vu son tirage.",
  ]);
  await page.getByRole("button", { name: "Annuler" }).click();
  await page
    .locator(".row")
    .nth(5)
    .getByRole("button", { name: "Effacer le mot de passe" })
    .click();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Mot de passe de Anne effacé.");
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await expect(page.locator("main p")).toHaveText([redoQuestion, redoExplanation]);
});

test("« Refaire le tirage » is there when nobody has a password", async ({ page }) => {
  const calls = await mockReserved(page, undefined, []);
  await enter(page);
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await expect(page.getByRole("status")).toHaveText(redone);
  expect(calls.at(-1)).toEqual({ password: adminPassword, action: "redraw" });
});

test("a double tap on « Refaire le tirage » of the confirmation makes one call", async ({
  page,
}) => {
  const calls = await mockReserved(page);
  await enter(page);
  await slow(page, "redraw");
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await page.getByRole("button", { name: "Refaire le tirage" }).dblclick();
  await expect(page.getByRole("status")).toHaveText(redone);
  await page.waitForTimeout(1000);
  expect(calls.slice(1)).toEqual([{ password: adminPassword, action: "redraw" }]);
});

test("« Annuler » during a redraw: the list shows the answer received", async ({ page }) => {
  const calls = await mockReserved(page);
  await enter(page);
  await slow(page, "redraw");
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("status")).toHaveText(redone);
  expect(calls).toHaveLength(2);
});

test("network cut at the redraw: banner, « Réessayer » makes the same call", async ({ page }) => {
  const calls = await mockReserved(page, (n) => (n === 2 ? "abort" : undefined));
  await enter(page);
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await page.getByRole("button", { name: "Refaire le tirage" }).click();
  await expect(page.getByRole("alert")).toContainText(offline);
  await expect(page.getByText(redoQuestion, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("status")).toHaveText(redone);
  expect(calls.slice(1)).toEqual([
    { password: adminPassword, action: "redraw" },
    { password: adminPassword, action: "redraw" },
  ]);
});
