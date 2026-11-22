// The calls to the functions of api/, and the banner shown when the site does not answer.

/** The error codes of the functions that a screen handles itself (docs/architecture.md). */
const handled = new Set(["too_short", "already_chosen", "no_password", "wrong_password", "locked"]);

/**
 * How long a call waits for its answer, in milliseconds, before the banner (« Le réseau » of
 * docs/architecture.md).
 */
const delay = 15_000;

/** @type {HTMLElement | null} */
let banner = null;

/**
 * The calls whose answer is awaited, each with the `isCurrent` given to call(): one of the
 * previous screen does not hold the screen shown.
 * @type {Set<{ isCurrent: () => boolean }>}
 */
const awaited = new Set();

/**
 * Whether the answer of a call of the screen shown is awaited: a tap that would call again
 * does nothing then. Not while the banner is shown: nothing is awaited.
 */
export function waiting() {
  for (const { isCurrent } of awaited) if (isCurrent()) return true;
  return false;
}

/** Removes the banner, when the screen changes. */
export function clearBanner() {
  banner?.remove();
  banner = null;
}

/**
 * Shows the banner; « Réessayer » removes it and runs `retry`.
 * @param {() => void} retry
 */
function showBanner(retry) {
  clearBanner();
  banner = document.createElement("div");
  banner.className = "banner";
  banner.setAttribute("role", "alert");
  const text = document.createElement("p");
  text.textContent = "Oups, le site ne répond pas. Vérifie ta connexion à internet, puis réessaie.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn primary";
  button.textContent = "Réessayer";
  button.addEventListener("click", () => {
    clearBanner();
    retry();
  });
  banner.append(text, button);
  document.body.append(banner);
  if (!document.activeElement || document.activeElement === document.body) button.focus();
}

/**
 * One call: its answer, or null when the site does not answer as the table of the functions
 * says (network cut, 5xx, any other status or body, no answer within `delay`). The delay is
 * an AbortController and a timer, not AbortSignal.timeout, which Safari lacks before 16.
 * Neither a banner nor `waiting()`: the home page asks the states of the participants by it.
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<{ status: number, data: any } | null>}
 */
export async function attempt(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), delay);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json();
    if (response.ok || handled.has(data?.error)) return { status: response.status, data };
  } catch {
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Calls a function of api/ with a JSON body. When the site does not answer, the screen stays
 * as it is with the banner, and « Réessayer » makes the same call again: the promise resolves
 * with the first answer of the table of the functions. While an answer is awaited,
 * `waiting()` is true.
 * @param {string} path
 * @param {unknown} body
 * @param {() => boolean} isCurrent From `turn()`: once the screen has changed, no banner.
 * @returns {Promise<{ status: number, data: any }>}
 */
export function call(path, body, isCurrent) {
  return new Promise((resolve) => {
    const run = async () => {
      const pending = { isCurrent };
      awaited.add(pending);
      const answer = await attempt(path, body);
      awaited.delete(pending);
      if (answer) resolve(answer);
      else if (isCurrent()) showBanner(run);
    };
    run();
  });
}
