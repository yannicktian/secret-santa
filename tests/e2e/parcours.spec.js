import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { expect, test } from "@playwright/test";

// The complete journey, without interception: every story of the spec (S1 to S7) is gone
// through at least once on scripts/dev-server.js and its memory store. The server is started
// for this run only, on a port of its own, so that no other test shares its store. The
// passwords, the administration password included, are fictitious.
const adminPassword = "admin-fictif-parcours";
const names = ["Yannick", "Léa", "Christine", "Guigui", "Mamet", "Anne", "Loulou"];
const wrong = "Ce n'est pas le bon mot de passe. Réessaie.";
const locked = "Beaucoup d'essais ratés : attends une minute avant de réessayer.";
const forgot =
  "Mot de passe oublié ? Demande à Yannick de l'effacer : tu en choisiras un nouveau, et ton tirage ne changera pas.";
const forgotYannick = "Mot de passe oublié ? Efface-le depuis la page réservée.";
const firstTime =
  "C'est ta première visite. Choisis un mot de passe : il te servira à revoir ton tirage plus tard.";
const reminder = "Les tirages ne s'affichent jamais ici, pas même le tien.";

test.describe.configure({ mode: "serial" });

/** @type {import("node:child_process").ChildProcess | undefined} */
let server;
let base = "";

/** The names drawn, by giver, as the gift showed them. */
/** @type {Record<string, string>} */
const drawn = {};

/** A free port of the machine. */
async function freePort() {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  await once(probe, "close");
  if (!address || typeof address === "string") throw new Error("No port");
  return address.port;
}

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "360", "The journey runs at 360 pixels only");
  const port = await freePort();
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, PORT: String(port), SECRET_SANTA_STORE: "memory" };
  delete env.VERCEL_ENV;
  server = spawn(process.execPath, ["scripts/dev-server.js"], {
    env: { ...env, ADMIN_PASSWORD: adminPassword },
    stdio: "ignore",
  });
  base = `http://localhost:${port}`;
  await expect(async () => {
    const response = await fetch(`${base}/api/health`);
    expect(await response.json()).toEqual({ ok: true, store: "memory", reservedPage: true });
  }).toPass({ timeout: 10_000 });
});

test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill();
  await exited;
});

test.beforeEach(async ({ page }) => {
  test.skip(test.info().project.name !== "360", "The journey runs at 360 pixels only");
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00+01:00"));
});

/**
 * No horizontal scroll on the screen shown.
 * @param {import("@playwright/test").Page} page
 */
async function fits(page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(360);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/**
 * Opens the home page and touches a name.
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
async function touch(page, name) {
  await page.goto(`${base}/`);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByText(`Bonjour ${name} !`)).toBeVisible();
}

/**
 * Sends the password typed on the screen shown, waiting for the answer of the function.
 * @param {import("@playwright/test").Page} page
 * @param {string} password
 * @param {"Valider" | "Voir mon tirage"} button
 */
async function send(page, password, button) {
  await page.getByLabel("Ton mot de passe").fill(password);
  const path = button === "Valider" ? "/api/choose-password" : "/api/open-gift";
  const answer = page.waitForResponse((response) => response.url().endsWith(path));
  await page.getByRole("button", { name: button }).click();
  return (await answer).status();
}

/**
 * Opens the gift shown and returns the name drawn (S4).
 * @param {import("@playwright/test").Page} page
 */
async function openGift(page) {
  await expect(page.getByText("Ton tirage est dans ce paquet.")).toBeVisible();
  await page.getByRole("button", { name: "Touche le paquet pour l'ouvrir." }).click();
  await expect(page.getByText("Tu offres ton cadeau à")).toBeVisible();
  await expect(page.getByText("Garde le secret jusqu'au 25 décembre !")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour à l'accueil" })).toBeVisible();
  await fits(page);
  return String(await page.locator(".name").textContent());
}

/**
 * Opens the reserved page with the administration password.
 * @param {import("@playwright/test").Page} page
 */
async function enterReserved(page) {
  await page.goto(`${base}/reservee`);
  await page.getByLabel("Mot de passe d'administration").fill(adminPassword);
  await page.getByRole("button", { name: "Entrer" }).click();
  await expect(page.getByRole("heading", { name: "Participants" })).toBeVisible();
}

/**
 * Erases the password of a participant from the reserved page (S6).
 * @param {import("@playwright/test").Page} page
 * @param {number} row
 * @param {string} name
 */
async function erase(page, row, name) {
  const line = page.locator(".row").nth(row);
  await line.getByRole("button", { name: "Effacer le mot de passe" }).click();
  await expect(page.getByText(`Effacer le mot de passe de ${name} ?`)).toBeVisible();
  await expect(
    page.getByText(
      `${name} en choisira un nouveau à sa prochaine visite. Son tirage ne change pas.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(`Mot de passe de ${name} effacé.`);
  await expect(line.locator(".st")).toHaveText("Pas encore de mot de passe");
}

test("S7: two participants who validate at the same time get names of one draw", async ({
  browser,
}) => {
  const people = [
    { name: "Christine", password: "neige" },
    { name: "Guigui", password: "luge" },
  ];
  const contexts = await Promise.all(people.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  for (const [i, { name, password }] of people.entries()) {
    await pages[i].clock.setFixedTime(new Date("2026-11-22T10:00:00+01:00"));
    await touch(pages[i], name);
    await pages[i].getByLabel("Ton mot de passe").fill(password);
  }
  const statuses = await Promise.all(
    pages.map(async (page) => {
      const answer = page.waitForResponse((r) => r.url().endsWith("/api/choose-password"));
      await page.getByRole("button", { name: "Valider" }).click();
      return (await answer).status();
    }),
  );
  expect(statuses).toEqual([200, 200]);
  for (const [i, { name }] of people.entries()) {
    drawn[name] = await openGift(pages[i]);
    expect(names).toContain(drawn[name]);
    expect(drawn[name]).not.toBe(name);
  }
  expect(drawn.Christine).not.toBe(drawn.Guigui);
  await Promise.all(contexts.map((context) => context.close()));
});

test("S1, S2, S4: Léa arrives for the first time, chooses « Sapin » and opens her gift", async ({
  page,
}) => {
  const response = await page.goto(`${base}/`);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page.locator("main > *")).toHaveText([
    "Secret santa de Noël",
    /Cette année, chacun offre un cadeau à une personne tirée au sort\. Chut : personne ne sait qui lui offre le sien !.*Rendez-vous le 25 décembre à midi\..*Plus que 33 jours !/s,
    "Qui es-tu ?",
    /.*/s,
  ]);
  const players = page.locator(".players").getByRole("button");
  await expect(players).toHaveCount(7);
  for (const [i, name] of names.entries()) {
    await expect(players.nth(i)).toHaveAccessibleName(name);
    expect((await players.nth(i).boundingBox())?.height).toBeGreaterThanOrEqual(56);
  }
  await expect(page.locator("a")).toHaveCount(0);
  await fits(page);

  // « Ce n'est pas moi » records nothing: touched again, Léa is still on her first visit.
  await players.nth(1).click();
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  await expect(page.getByText(firstTime)).toBeVisible();
  await page.getByRole("button", { name: "Ce n'est pas moi" }).click();
  await expect(page.getByText("Qui es-tu ?")).toBeVisible();
  await touch(page, "Léa");
  await expect(page.getByText(firstTime)).toBeVisible();
  await expect(
    page.getByText(
      "Prends-en un simple, facile à retenir : le nom d'un animal, d'une ville, d'un plat.",
    ),
  ).toBeVisible();
  const field = page.getByLabel("Ton mot de passe");
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveAttribute("autocapitalize", "none");
  await fits(page);

  await field.fill(" abc ");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("alert")).toHaveText("Il faut au moins 4 lettres ou chiffres.");
  expect(await send(page, "Sapin", "Valider")).toBe(200);
  drawn.Léa = await openGift(page);
  expect(names).toContain(drawn.Léa);
  expect(drawn.Léa).not.toBe("Léa");
  expect(Object.values(drawn)).toEqual([...new Set(Object.values(drawn))]);
});

test("S5: nothing is kept; back, reload and « Retour à l'accueil » lead home", async ({
  page,
  context,
}) => {
  await touch(page, "Léa");
  expect(await send(page, "sapin", "Voir mon tirage")).toBe(200);
  expect(await openGift(page)).toBe(drawn.Léa);
  const kept = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    cookie: document.cookie,
  }));
  expect(kept).toEqual({ local: 0, session: 0, databases: 0, cookie: "" });
  expect(await context.cookies()).toEqual([]);

  // Back leaves the site; forward shows the home page, not the gift.
  await page.goBack();
  expect(page.url()).not.toContain(base);
  await page.goForward();
  await expect(page.getByText("Qui es-tu ?")).toBeVisible();
  await expect(page.getByText("Tu offres ton cadeau à")).toHaveCount(0);

  await page.getByRole("button", { name: "Léa", exact: true }).click();
  await expect(page.getByRole("button", { name: "Voir mon tirage" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Qui es-tu ?")).toBeVisible();
  await expect(page.getByText("Bonjour Léa !")).toHaveCount(0);

  await touch(page, "Léa");
  expect(await send(page, "sapin", "Voir mon tirage")).toBe(200);
  await openGift(page);
  await page.getByRole("button", { name: "Retour à l'accueil" }).click();
  await expect(page.getByText("Qui es-tu ?")).toBeVisible();
  await expect(page.getByText("Tu offres ton cadeau à")).toHaveCount(0);
});

test("S3: Léa comes back, a wrong password, then « sapin » in any case: the same name", async ({
  page,
}) => {
  await touch(page, "Léa");
  await expect(page.getByText(firstTime)).toHaveCount(0);
  await expect(page.getByText("Majuscules ou minuscules : peu importe.")).toBeVisible();
  await expect(page.getByText(forgot)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ce n'est pas moi" })).toBeVisible();
  await fits(page);
  expect(await send(page, "houx", "Voir mon tirage")).toBe(401);
  await expect(page.getByRole("alert")).toHaveText(wrong);
  await expect(page.getByLabel("Ton mot de passe")).toHaveValue("");
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  expect(await send(page, "  SÂPIN ", "Voir mon tirage")).toBe(200);
  expect(await openGift(page)).toBe(drawn.Léa);
});

test("S3: Yannick, 5 wrong attempts in a row, then locked even with his password", async ({
  page,
}) => {
  await touch(page, "Yannick");
  expect(await send(page, "renne", "Valider")).toBe(200);
  drawn.Yannick = await openGift(page);
  await touch(page, "Yannick");
  await expect(page.getByText(forgotYannick)).toBeVisible();
  await expect(page.getByText(forgot)).toHaveCount(0);
  for (let i = 1; i <= 4; i += 1) {
    expect(await send(page, "lutin", "Voir mon tirage")).toBe(401);
    await expect(page.getByRole("alert")).toHaveText(wrong);
  }
  expect(await send(page, "lutin", "Voir mon tirage")).toBe(429);
  await expect(page.getByRole("alert")).toHaveText(locked);
  expect(await send(page, "renne", "Voir mon tirage")).toBe(429);
  await expect(page.getByRole("alert")).toHaveText(locked);
  await fits(page);
});

test("S6: Yannick sees who has chosen a password and erases Léa's and his own", async ({
  page,
}) => {
  const response = await page.goto(`${base}/reservee`);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page réservée");
  await page.getByLabel("Mot de passe d'administration").fill("renne");
  await page.getByRole("button", { name: "Entrer" }).click();
  await expect(page.getByRole("alert")).toHaveText("Ce n'est pas le bon mot de passe.");

  await enterReserved(page);
  const rows = page.locator(".row");
  await expect(rows.locator(".n")).toHaveText(names);
  const chosen = ["Yannick", "Léa", "Christine", "Guigui"];
  await expect(rows.locator(".st")).toHaveText(
    names.map((name) =>
      chosen.includes(name) ? "Mot de passe choisi" : "Pas encore de mot de passe",
    ),
  );
  await expect(page.getByText(reminder)).toBeVisible();
  await fits(page);
  await erase(page, 1, "Léa");
  await erase(page, 0, "Yannick");
  await expect(page.getByText(reminder)).toBeVisible();
  for (const password of ["sapin", "renne", "neige", "luge"]) {
    await expect(page.locator("body")).not.toContainText(password);
  }
});

test("S6, S7: after the erasing, Léa chooses « houx » and Yannick a new one: same names", async ({
  page,
}) => {
  await touch(page, "Léa");
  await expect(page.getByText(firstTime)).toBeVisible();
  expect(await send(page, "houx", "Valider")).toBe(200);
  expect(await openGift(page)).toBe(drawn.Léa);

  await touch(page, "Yannick");
  await expect(page.getByText(firstTime)).toBeVisible();
  expect(await send(page, "étoile", "Valider")).toBe(200);
  expect(await openGift(page)).toBe(drawn.Yannick);
});

test("S4, S7: each one sees the same name at each visit, all from one draw", async ({ page }) => {
  for (const [name, password] of [
    ["Christine", "NEIGE"],
    ["Guigui", "Luge "],
    ["Léa", "Houx"],
    ["Yannick", "etoile"],
  ]) {
    await touch(page, name);
    expect(await send(page, password, "Voir mon tirage")).toBe(200);
    expect(await openGift(page)).toBe(drawn[name]);
  }
  const receivers = Object.values(drawn);
  expect(receivers).toHaveLength(4);
  expect(new Set(receivers).size).toBe(4);
  for (const [giver, receiver] of Object.entries(drawn)) expect(receiver).not.toBe(giver);
});
