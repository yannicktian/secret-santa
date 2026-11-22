// The page réservée (S6), at /reservee: the administration password, the list of the
// participants with the state of their password, and its erasing. The administration
// password lives in a variable for the visit only, sent with each call (docs/architecture.md,
// A6); reloading the page asks for it again. Nothing is kept on the device.
import { call, clearBanner } from "./call.js";

const root = /** @type {HTMLElement} */ (document.querySelector("main"));

/** @typedef {{ id: string, name: string, hasPassword: boolean }} Participant */

/** The administration password once accepted, for the visit only. */
let password = "";

/** @type {Participant[]} */
let participants = [];

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

/**
 * A button of the page.
 * @param {string} className
 * @param {string} text
 * @param {() => void} onClick
 */
function button(className, text, onClick) {
  const node = element("button", className, text);
  node.setAttribute("type", "button");
  node.addEventListener("click", onClick);
  return node;
}

/** Grows at each screen change or tap, so that a late answer does not replace a newer screen. */
let shown = 0;

/** Takes a turn before a call: the function returned says whether the answer is still awaited. */
function turn() {
  shown += 1;
  clearBanner();
  const current = shown;
  return () => current === shown;
}

/**
 * Shows a screen under the title of the page.
 * @param {...Node} children
 */
function show(...children) {
  shown += 1;
  clearBanner();
  root.replaceChildren(element("h1", "title-small", "Page réservée"), ...children);
  window.scrollTo(0, 0);
}

/**
 * The messages of the answers that refuse the administration password.
 * @type {Record<string, string>}
 */
const refusals = {
  wrong_password: "Ce n'est pas le bon mot de passe.",
  locked: "Beaucoup d'essais ratés : attends une minute avant de réessayer.",
};

/**
 * Handles an answer of POST /api/reserved: the list, or the form again with its message.
 * @param {{ status: number, data: any }} answer
 * @param {string} [done] The message to show above the list.
 */
function answered({ data }, done) {
  if (Array.isArray(data.participants)) {
    participants = data.participants;
    showList(done);
  } else {
    password = "";
    participants = [];
    showForm(refusals[data.error]);
  }
}

/**
 * The form of the administration password, with the message of a refusal.
 * @param {string} [message]
 * @param {string} [typed]
 */
function showForm(message, typed = "") {
  const input = document.createElement("input");
  input.id = "admin-password";
  input.type = "password";
  input.autocomplete = "off";
  input.value = typed;
  const label = element("label", "", "Mot de passe d'administration");
  label.setAttribute("for", input.id);
  const enter = element("button", "btn primary", "Entrer");
  enter.setAttribute("type", "submit");
  const form = element("form", "field", label, input);
  form.setAttribute("novalidate", "");
  if (message) {
    const error = element("p", "error", message);
    error.setAttribute("role", "alert");
    form.append(error);
  }
  form.append(enter);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const typed = input.value;
    const isCurrent = turn();
    const answer = await call("/api/reserved", { password: typed, action: "list" }, isCurrent);
    if (!isCurrent()) return;
    if (answer.data.error) {
      showForm(refusals[answer.data.error], typed);
      return;
    }
    password = typed;
    answered(answer);
  });
  show(element("div", "shadow", element("div", "panel", form)));
}

/**
 * The list of the participants, with the message of an erasing.
 * @param {string} [done]
 */
function showList(done) {
  const rows = participants.map((participant) => {
    const state = participant.hasPassword ? "Mot de passe choisi" : "Pas encore de mot de passe";
    const row = element(
      "div",
      "row",
      element("span", "n", participant.name),
      element("span", participant.hasPassword ? "st on" : "st", state),
    );
    if (participant.hasPassword) {
      row.append(button("btn danger", "Effacer le mot de passe", () => showConfirm(participant)));
    }
    return row;
  });
  const panel = element(
    "div",
    "panel",
    element("h2", "", "Participants"),
    element("div", "list", ...rows),
    element("p", "hint", "Les tirages ne s'affichent jamais ici, pas même le tien."),
  );
  const children = [element("div", "shadow", panel)];
  if (done) {
    const ok = element("p", "ok", done);
    ok.setAttribute("role", "status");
    children.unshift(ok);
  }
  show(...children);
}

/**
 * The confirmation of an erasing.
 * @param {Participant} participant
 */
function showConfirm(participant) {
  const { id, name } = participant;
  const erase = async () => {
    const isCurrent = turn();
    const body = { password, action: "erase", participant: id };
    const answer = await call("/api/reserved", body, isCurrent);
    if (isCurrent()) answered(answer, `Mot de passe de ${name} effacé.`);
  };
  const panel = element(
    "div",
    "panel",
    element("p", "", element("strong", "", `Effacer le mot de passe de ${name} ?`)),
    element(
      "p",
      "",
      `${name} en choisira un nouveau à sa prochaine visite. Son tirage ne change pas.`,
    ),
    element(
      "div",
      "actions",
      button("btn danger", "Effacer", erase),
      button("btn plain", "Annuler", () => showList()),
    ),
  );
  show(element("div", "shadow", panel));
}

/** Forgets everything and asks for the administration password. */
function start() {
  password = "";
  participants = [];
  showForm();
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) start();
});

start();
