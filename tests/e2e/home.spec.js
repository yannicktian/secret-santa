import { expect, test } from "@playwright/test";

const names = ["Yannick", "Léa", "Christine", "Guigui", "Mamet", "Anne", "Loulou"];
const title = "Secret santa de Noël";
const presentation =
  "Cette année, chacun offre un cadeau à une personne tirée au sort. Chut : personne ne sait qui lui offre le sien !";
const date = "Rendez-vous le 25 décembre à midi.";
const offline = "Oups, le site ne répond pas. Vérifie ta connexion à internet, puis réessaie.";

/**
 * Makes POST /api/participants fail, so that a tap on a first name calls POST
 * /api/participant, as when the states of the home page are not known.
 * @param {import("@playwright/test").Page} page
 */
function withoutStates(page) {
  return page.route("**/api/participants", (route) => route.abort("internetdisconnected"));
}

/**
 * Opens the home page on a day in Paris, with POST /api/participant intercepted and the
 * states of the home page unknown.
 * @param {import("@playwright/test").Page} page
 * @param {string} day
 * @param {{ hasPassword?: boolean }} [answer]
 */
async function openHome(page, day = "2026-11-22", answer = { hasPassword: false }) {
  /** @type {unknown[]} */
  const calls = [];
  await withoutStates(page);
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
  await withoutStates(page);
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
    await withoutStates(page);
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

test("after a second failure, the focus is on « Réessayer »", async ({ page }) => {
  await withoutStates(page);
  await page.route("**/api/participant", (route) => route.abort("internetdisconnected"));
  await page.goto("/");
  await page.getByRole("button", { name: "Léa" }).click();
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeFocused();
});

/**
 * Holds the answers of POST /api/participant: each call fails or waits for `release()`.
 * @param {import("@playwright/test").Page} page
 * @param {(attempt: number) => boolean} fails
 */
async function holdAnswers(page, fails = () => false) {
  /** @type {unknown[]} */
  const calls = [];
  /** @type {() => void} */
  let release = () => {};
  await withoutStates(page);
  await page.route("**/api/participant", async (route) => {
    calls.push(route.request().postDataJSON());
    if (fails(calls.length)) return route.abort("internetdisconnected");
    await new Promise((resolve) => {
      release = () => resolve(undefined);
    });
    return route.fulfill({ json: { hasPassword: false } });
  });
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00+01:00"));
  await page.goto("/");
  return { calls, release: () => release() };
}

/**
 * Checks that the seven buttons are disabled and that only `name` shows the indicator, with
 * its accessible name unchanged.
 * @param {import("@playwright/test").Page} page
 * @param {string} name
 */
async function expectLoading(page, name) {
  const buttons = page.locator(".player");
  for (const [i, other] of names.entries()) {
    await expect(buttons.nth(i)).toHaveAttribute("aria-disabled", "true");
    await expect(buttons.nth(i)).toHaveAccessibleName(other);
    if (other === name) await expect(buttons.nth(i)).toHaveAttribute("aria-busy", "true");
    else await expect(buttons.nth(i)).not.toHaveAttribute("aria-busy");
  }
  // The arrow of the button tapped gives way to the three pixels of its ::before.
  const shown = await page.locator(".player[aria-busy] .arrow").evaluate((element) => ({
    arrow: getComputedStyle(element).fontSize,
    pixels: getComputedStyle(element, "::before").width,
  }));
  expect(shown).toEqual({ arrow: "0px", pixels: "8px" });
}

/** @param {import("@playwright/test").Page} page */
async function expectActive(page) {
  for (const button of await page.locator(".player").all()) {
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
    await expect(button).not.toHaveAttribute("aria-busy");
  }
}

test("while the answer is awaited: indicator, seven buttons disabled, a second tap ignored", async ({
  page,
}, testInfo) => {
  const { calls, release } = await holdAnswers(page);
  await page.getByRole("button", { name: "Léa" }).click();
  await expectLoading(page, "Léa");
  await capture(page, `accueil-chargement-${testInfo.project.name}`);
  await page.getByRole("button", { name: "Mamet" }).click({ force: true });
  await page.getByRole("button", { name: "Léa" }).click({ force: true });
  await expectLoading(page, "Léa");
  expect(calls).toEqual([{ participant: "lea" }]);
  release();
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  expect(calls).toEqual([{ participant: "lea" }]);
});

test("network error: banner and active buttons; « Réessayer » waits again", async ({ page }) => {
  const { calls, release } = await holdAnswers(page, (attempt) => attempt === 1);
  await page.getByRole("button", { name: "Léa" }).click();
  await expect(page.getByRole("alert")).toContainText(offline);
  await expectActive(page);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expectLoading(page, "Léa");
  release();
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  expect(calls).toEqual([{ participant: "lea" }, { participant: "lea" }]);
});

test("after the banner, another first name can be tapped", async ({ page }) => {
  const { calls, release } = await holdAnswers(page, (attempt) => attempt === 1);
  await page.getByRole("button", { name: "Léa" }).click();
  await expect(page.getByRole("alert")).toContainText(offline);
  await page.getByRole("button", { name: "Mamet" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expectLoading(page, "Mamet");
  release();
  await expect(page.getByText("Bonjour Mamet !")).toBeVisible();
  expect(calls).toEqual([{ participant: "lea" }, { participant: "mamet" }]);
});

test("with fewer animations, the indicator does not move", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { release } = await holdAnswers(page);
  await page.getByRole("button", { name: "Léa" }).click();
  await expectLoading(page, "Léa");
  const animation = await page
    .locator(".player[aria-busy] .arrow")
    .evaluate((element) => getComputedStyle(element, "::before").animationName);
  expect(animation).toBe("none");
  release();
});

/**
 * Opens the home page with POST /api/participants answering `states` (or held without an
 * answer when null) and POST /api/participant held without an answer, its calls kept.
 * @param {import("@playwright/test").Page} page
 * @param {Record<string, boolean> | null | "offline" | 500} states
 */
async function openWithStates(page, states) {
  /** @type {unknown[]} */
  const asked = [];
  /** @type {unknown[]} */
  const calls = [];
  /** @type {() => void} */
  let done = () => {};
  const answered = new Promise((resolve) => {
    done = () => resolve(undefined);
  });
  await page.route("**/api/participants", async (route) => {
    asked.push(route.request().postDataJSON());
    if (states === null) return;
    if (states === "offline") await route.abort("internetdisconnected");
    else if (states === 500) await route.fulfill({ status: 500, json: { error: "internal" } });
    else await route.fulfill({ json: { hasPassword: states } });
    done();
  });
  await page.route("**/api/participant", (route) => {
    calls.push(route.request().postDataJSON());
  });
  await page.clock.setFixedTime(new Date("2026-11-22T10:00:00+01:00"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  if (states !== null) {
    await answered;
    await settle(page);
  }
  return { asked, calls };
}

/**
 * Leaves the page the time to read an answer that has just come.
 * @param {import("@playwright/test").Page} page
 */
function settle(page) {
  return page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
}

/** The states of a fictitious home page: Mamet and Anne have chosen their password. */
const known = {
  yannick: false,
  lea: false,
  christine: false,
  guigui: false,
  mamet: true,
  anne: true,
  loulou: false,
};

test("the home page is shown without waiting for the states of the participants", async ({
  page,
}) => {
  const { asked, calls } = await openWithStates(page, null);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  await expectActive(page);
  expect(asked).toEqual([{}]);
  // Not known yet: the tap waits for POST /api/participant, with the indicator.
  await page.getByRole("button", { name: "Léa" }).click();
  await expectLoading(page, "Léa");
  expect(calls).toEqual([{ participant: "lea" }]);
});

test("states known: S2 or S3 at once, without a call nor indicator", async ({ page }) => {
  const { asked, calls } = await openWithStates(page, known);
  await page.getByRole("button", { name: "Léa" }).click();
  await expect(page.getByText("Bonjour Léa !")).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider" })).toBeVisible();
  await page.getByRole("button", { name: "Ce n'est pas moi" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Qui es-tu ?");
  // Back home, the states are asked again.
  await expect.poll(() => asked.length).toBe(2);
  await settle(page);
  await page.getByRole("button", { name: "Mamet" }).click();
  await expect(page.getByText("Bonjour Mamet !")).toBeVisible();
  await expect(page.getByRole("button", { name: "Voir mon tirage" })).toBeVisible();
  expect(calls).toEqual([]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const failure of /** @type {const} */ (["offline", 500])) {
  test(`states failing (${failure}): no banner, the tap calls POST /api/participant`, async ({
    page,
  }) => {
    const { calls } = await openWithStates(page, failure);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectActive(page);
    await page.getByRole("button", { name: "Anne" }).click();
    await expectLoading(page, "Anne");
    expect(calls).toEqual([{ participant: "anne" }]);
  });
}

test("reloading the home page asks the states again; nothing is kept", async ({
  page,
  context,
}) => {
  const { asked } = await openWithStates(page, known);
  await page.reload();
  await expect.poll(() => asked.length).toBe(2);
  expect(await context.cookies()).toEqual([]);
  const stored = await page.evaluate(() => localStorage.length + sessionStorage.length);
  expect(stored).toBe(0);
});

/**
 * Intercepts the call of the password screen with one answer.
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @param {number} status
 * @param {string} error
 */
function answerWith(page, path, status, error) {
  return page.route(`**${path}`, (route) => route.fulfill({ status, json: { error } }));
}

test("stale state, password chosen meanwhile: S2, then « already_chosen » shows S3", async ({
  page,
}) => {
  await openWithStates(page, known);
  await answerWith(page, "/api/choose-password", 409, "already_chosen");
  await page.getByRole("button", { name: "Léa" }).click();
  await page.getByLabel("Ton mot de passe").fill("Renne");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("button", { name: "Voir mon tirage" })).toBeVisible();
  await expect(page.getByLabel("Ton mot de passe")).toHaveValue("");
});

test("stale state, password erased meanwhile: S3, then « no_password » shows S2", async ({
  page,
}) => {
  await openWithStates(page, known);
  await answerWith(page, "/api/open-gift", 409, "no_password");
  await page.getByRole("button", { name: "Mamet" }).click();
  await page.getByLabel("Ton mot de passe").fill("Renne");
  await page.getByRole("button", { name: "Voir mon tirage" }).click();
  await expect(page.getByRole("button", { name: "Valider" })).toBeVisible();
  await expect(page.getByText("C'est ta première visite.", { exact: false })).toBeVisible();
});
