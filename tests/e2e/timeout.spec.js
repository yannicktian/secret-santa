import { expect, test } from "@playwright/test";

// The delay of the calls (« Le réseau » of docs/architecture.md): an answer that does not
// come within 15 seconds shows the banner, as a network cut does. The clock of the page is
// faked by page.clock; the administration password is fictitious.
const delay = 15_000;
const offline = "Oups, le site ne répond pas. Vérifie ta connexion à internet, puis réessaie.";
const adminPassword = "flocon-fictif";
const names = ["Yannick", "Léa", "Christine", "Guigui", "Mamet", "Anne", "Loulou"];
const ids = ["yannick", "lea", "christine", "guigui", "mamet", "anne", "loulou"];

const start = new Date("2026-11-22T10:00:00+01:00").getTime();

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: start });
});

/**
 * Opens `path`, then stops the clock of the page, which only moves by runFor from then on.
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 */
async function open(page, path) {
  await page.goto(path);
  await page.clock.pauseAt(start + 60_000);
}

test("an answer that never comes: banner at the end of the delay, « Réessayer » calls again", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/participant", (route) => {
    attempts += 1;
    // The first call is left without an answer.
    if (attempts > 1) return route.fulfill({ json: { hasPassword: true } });
  });
  await open(page, "/");
  await page.getByRole("button", { name: "Léa" }).click();
  await expect.poll(() => attempts).toBe(1);
  await page.clock.runFor(delay - 1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.getByRole("alert")).toContainText(offline);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("a slow answer within the delay shows the screen, and no banner later", async ({ page }) => {
  /** @type {() => void} */
  let answer = () => {};
  const answered = new Promise((resolve) => {
    answer = () => resolve(undefined);
  });
  let attempts = 0;
  await page.route("**/api/participant", async (route) => {
    attempts += 1;
    await answered;
    return route.fulfill({ json: { hasPassword: true } });
  });
  await open(page, "/");
  await page.getByRole("button", { name: "Léa" }).click();
  await expect.poll(() => attempts).toBe(1);
  await page.clock.runFor(delay - 1000);
  answer();
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  await page.clock.runFor(2 * delay);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  expect(attempts).toBe(1);
});

test("« Effacer » without an answer: banner at the end of the delay, « Réessayer » erases", async ({
  page,
}) => {
  /** @type {any[]} */
  const calls = [];
  const chosen = new Set(["yannick", "lea", "mamet"]);
  await page.route("**/api/reserved", (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    // The first « Effacer » is left without an answer.
    if (calls.length === 2) return;
    if (body.action === "erase") chosen.delete(body.participant);
    const participants = ids.map((id, i) => ({ id, name: names[i], hasPassword: chosen.has(id) }));
    return route.fulfill({ json: { participants } });
  });
  await open(page, "/reservee");
  await page.getByLabel("Mot de passe d'administration").fill(adminPassword);
  await page.getByRole("button", { name: "Entrer" }).click();
  await page
    .locator(".row")
    .nth(4)
    .getByRole("button", { name: "Effacer le mot de passe" })
    .click();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  await expect.poll(() => calls.length).toBe(2);
  await page.clock.runFor(delay);
  await expect(page.getByRole("alert")).toContainText(offline);
  await expect(page.getByText("Effacer le mot de passe de Mamet ?")).toBeVisible();
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("status")).toHaveText("Mot de passe de Mamet effacé.");
  expect(calls.slice(1)).toEqual([
    { password: adminPassword, action: "erase", participant: "mamet" },
    { password: adminPassword, action: "erase", participant: "mamet" },
  ]);
});
