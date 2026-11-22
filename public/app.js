// The screens of the participant: the home page (S1) and the passage from one screen to the
// next, in one document and without history entry (S5). The state lives in variables only.
import { call, clearBanner } from "./call.js";
import { countdown } from "./countdown.js";
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

/**
 * An element with its class and its children.
 * @param {string} tag
 * @param {string} className
 * @param {...(Node | string)} children
 */
function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

/** Empties the screen, the banner and the scroll, before showing another screen. */
function clear() {
  clearBanner();
  root.replaceChildren();
  window.scrollTo(0, 0);
}

/**
 * @param {{ id: string, name: string }} participant
 */
async function choose(participant) {
  const { data } = await call("/api/participant", { participant: participant.id });
  clear();
  showPassword(root, {
    participant,
    hasPassword: data.hasPassword === true,
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
    button.addEventListener("click", () => choose(participant));
    return button;
  });
  root.append(
    element("h1", "", "Secret santa de Noël"),
    element("div", "shadow", panel),
    element("h2", "who", "Qui es-tu ?"),
    element("div", "players", ...buttons),
  );
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) home();
});

home();
