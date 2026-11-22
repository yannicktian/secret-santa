// The calls to the functions of api/, and the banner shown when the site does not answer.

/** The error codes of the functions that a screen handles itself (docs/architecture.md). */
const handled = new Set(["too_short", "already_chosen", "no_password", "wrong_password", "locked"]);

/** @type {HTMLElement | null} */
let banner = null;

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
}

/**
 * One call: its answer, or null when the site does not answer as the table of the functions
 * says (network cut, 5xx, any other status or body).
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<{ status: number, data: any } | null>}
 */
async function attempt(path, body) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok || handled.has(data?.error)) return { status: response.status, data };
  } catch {}
  return null;
}

/**
 * Calls a function of api/ with a JSON body. When the site does not answer, the screen stays
 * as it is with the banner, and « Réessayer » makes the same call again: the promise resolves
 * with the first answer of the table of the functions.
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<{ status: number, data: any }>}
 */
export function call(path, body) {
  return new Promise((resolve) => {
    const run = async () => {
      const answer = await attempt(path, body);
      if (answer) resolve(answer);
      else showBanner(run);
    };
    run();
  });
}
