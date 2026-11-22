// The screens of the participant: the home page (S1) and the passage from one screen to the
// next, in one document and without history entry (S5). The state lives in variables only,
// the states of the participants asked as the home page opens included.
import { attempt, call, changeScreen, turn, waiting } from "./call.js";
import { countdown } from "./countdown.js";
import { element } from "./dom.js";
import { showGift } from "./screens/gift.js";
import { showPassword } from "./screens/password.js";

/** The participants, in the order of the scope of the spec. */
const participants = [
  { id: "yannick", name: "Yannick" },
  { id: "lea", name: "Léa" },
  { id: "christine", name: "Christine" },
  { id: "guigui", name: "Guigui" },
  { id: "mamet", name: "Mamet" },
  { id: "anne", name: "Anne" },
  { id: "loulou", name: "Loulou" },
];

const root = /** @type {HTMLElement} */ (document.querySelector("main"));

/** The buttons of the first names, while the home page is shown. @type {HTMLElement[]} */
let players = [];

/** The button of the first name tapped last. @type {HTMLElement | null} */
let tapped = null;

/**
 * Shows the buttons of the first names as the call allows: while its answer is awaited, the
 * seven are disabled and the one tapped shows the indicator; with the banner, all are active.
 */
function sync() {
  const busy = waiting();
  for (const button of players) {
    if (busy) button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
    if (busy && button === tapped) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }
}

// The banner comes and goes as a direct child of the body: it shows a failure, and its
// « Réessayer » makes the call again.
new MutationObserver(sync).observe(document.body, { childList: true });

/**
 * Whether each participant has a password, by id, as POST /api/participants answered for
 * the home page shown; null while unknown. Forgotten at each screen change.
 * @type {Record<string, boolean> | null}
 */
let states = null;

/** Grows at each screen change, so that the states asked for a previous home page are ignored. */
let visits = 0;

/**
 * Asks the states of the participants, without the indicator nor the banner: if the site
 * does not answer, a tap calls POST /api/participant as when they are not known yet.
 */
async function loadStates() {
  const visit = visits;
  const answer = await attempt("/api/participants", {});
  const hasPassword = answer?.status === 200 ? answer.data?.hasPassword : null;
  if (visit !== visits || typeof hasPassword !== "object" || hasPassword === null) return;
  states = hasPassword;
}

/** Empties the screen, the banner and the scroll, before showing another screen. */
function clear() {
  changeScreen();
  visits += 1;
  states = null;
  players = [];
  tapped = null;
  root.replaceChildren();
  window.scrollTo(0, 0);
}

/**
 * @param {{ id: string, name: string }} participant
 * @param {HTMLElement} button
 */
async function choose(participant, button) {
  if (waiting()) return;
  let hasPassword = states?.[participant.id];
  if (typeof hasPassword !== "boolean") {
    // Not known yet: the indicator until the answer.
    const isCurrent = turn();
    tapped = button;
    const answer = call("/api/participant", { participant: participant.id }, isCurrent);
    sync();
    const { data } = await answer;
    if (!isCurrent()) return;
    hasPassword = data.hasPassword === true;
  }
  clear();
  // A state that is no longer true is corrected by the screen: `already_chosen` leads to
  // S3, `no_password` to S2.
  showPassword(root, {
    participant,
    hasPassword,
    home,
    gift: (/** @type {string} */ receiver) => {
      clear();
      showGift(root, { receiver, home });
    },
  });
}

/** Shows the home page (S1) and forgets everything. */
function home() {
  clear();
  const panel = element(
    "div",
    "panel",
    element(
      "p",
      "",
      "Cette année, chacun offre un cadeau à une personne tirée au sort. Chut : personne ne sait qui lui offre le sien !",
    ),
  );
  const days = countdown(new Date());
  if (days) {
    panel.append(
      element(
        "div",
        "date",
        element("p", "", element("strong", "", "Rendez-vous le 25 décembre à midi.")),
        element("p", "countdown", days),
      ),
    );
  }
  const buttons = participants.map((participant) => {
    const badge = element("span", "badge", participant.name[0]);
    const arrow = element("span", "arrow", "▶");
    badge.setAttribute("aria-hidden", "true");
    arrow.setAttribute("aria-hidden", "true");
    const button = element("button", "btn player", badge, participant.name, arrow);
    button.setAttribute("type", "button");
    button.addEventListener("click", () => choose(participant, button));
    return button;
  });
  players = buttons;
  root.append(
    element("h1", "", "Secret santa de Noël"),
    element("div", "shadow", panel),
    element("h2", "who", "Qui es-tu ?"),
    element("div", "players", ...buttons),
  );
  loadStates();
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) home();
});

home();
