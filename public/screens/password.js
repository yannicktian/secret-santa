// The screens of the password: choosing it the first time (S2) and giving it back (S3).
import { call, turn, waiting } from "../call.js";
import { button, element } from "../dom.js";

/**
 * @typedef {object} PasswordContext
 * @property {{ id: string, name: string }} participant The participant touched on the home page.
 * @property {boolean} hasPassword From POST /api/participants or POST /api/participant: S3 if true, S2 otherwise.
 * @property {() => void} home Comes back to the home page and forgets everything.
 * @property {(receiver: string) => void} gift Shows the gift screen with the name drawn.
 */

const words = {
  firstTime:
    "C'est ta première visite. Choisis un mot de passe : il te servira à revoir ton tirage plus tard.",
  advice: "Prends-en un simple, facile à retenir : le nom d'un animal, d'une ville, d'un plat.",
  field: "Ton mot de passe",
  validate: "Valider",
  tooShort: "Il faut au moins 4 lettres ou chiffres.",
  help: "Majuscules ou minuscules : peu importe.",
  open: "Voir mon tirage",
  forgot:
    "Mot de passe oublié ? Demande à Yannick de l'effacer : tu en choisiras un nouveau, et ton tirage ne changera pas.",
  forgotYannick: "Mot de passe oublié ? Efface-le depuis la page réservée.",
  wrong: "Ce n'est pas le bon mot de passe. Réessaie.",
  locked: "Beaucoup d'essais ratés : attends une minute avant de réessayer.",
  notMe: "Ce n'est pas moi",
};

/** The field shown, put back above the keyboard when the visible part of the page shrinks. */
/** @type {(() => void) | null} */
let reveal = null;
window.visualViewport?.addEventListener("resize", () => reveal?.());

/** At least 4 characters, as the server counts them (T3 of docs/architecture.md). */
function longEnough(/** @type {string} */ password) {
  return [...password.trim().normalize("NFC")].length >= 4;
}

/**
 * Fills the screen of the password: S3 if the participant has one, S2 otherwise.
 * @param {HTMLElement} root
 * @param {PasswordContext} context
 */
export function showPassword(root, context) {
  render(root, context, context.hasPassword);
}

/**
 * @param {HTMLElement} root
 * @param {PasswordContext} context
 * @param {boolean} back S3 if true, S2 otherwise; the field is empty.
 */
function render(root, context, back) {
  const { participant } = context;
  const input = /** @type {HTMLInputElement} */ (element("input", ""));
  input.id = "password";
  input.type = "text";
  input.autocomplete = "off";
  input.setAttribute("autocapitalize", "none");
  input.setAttribute("autocorrect", "off");
  input.spellcheck = false;
  const label = element("label", "", words.field);
  label.setAttribute("for", input.id);
  const submit = element("button", "btn primary", back ? words.open : words.validate);
  submit.setAttribute("type", "submit");
  const error = element("p", "error");
  error.setAttribute("role", "alert");

  const form = element("form", "field");
  form.setAttribute("novalidate", "");
  form.append(label, input);
  if (back) form.append(element("p", "hint", words.help));
  form.append(submit);
  if (back) {
    const forgot = participant.id === "yannick" ? words.forgotYannick : words.forgot;
    form.append(element("p", "hint", forgot));
  }

  /** @param {string} message */
  const show = (message) => {
    error.textContent = message;
    if (!error.isConnected) submit.before(error);
  };

  /** Shows the field and the button above the keyboard, once it has opened. */
  reveal = () => {
    if (document.activeElement !== input) return;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const bottom = submit.getBoundingClientRect().bottom;
    if (bottom > height) window.scrollBy(0, bottom - height + 8);
    const top = input.getBoundingClientRect().top;
    if (top < 0) window.scrollBy(0, top - 8);
  };
  input.addEventListener("focus", reveal);
  input.addEventListener("click", reveal);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (waiting()) return;
    const password = input.value;
    if (!back && !longEnough(password)) {
      show(words.tooShort);
      return;
    }
    const isCurrent = turn();
    error.remove();
    const path = back ? "/api/open-gift" : "/api/choose-password";
    const { data } = await call(path, { participant: participant.id, password }, isCurrent);
    if (!isCurrent()) return;
    if (typeof data.receiver === "string") {
      context.gift(data.receiver);
    } else if (data.error === "too_short") {
      show(words.tooShort);
    } else if (data.error === "locked") {
      if (back) input.value = "";
      show(words.locked);
    } else if (data.error === "wrong_password") {
      input.value = "";
      show(words.wrong);
    } else if (data.error === "already_chosen" || data.error === "no_password") {
      render(root, context, data.error === "already_chosen");
      window.scrollTo(0, 0);
    }
  });

  const notMe = button("link", words.notMe, context.home);

  const panel = element("div", "panel");
  if (!back) panel.append(element("p", "", words.firstTime), element("p", "", words.advice));
  panel.append(form);
  const shadow = element("div", "shadow");
  shadow.append(panel);
  root.replaceChildren(element("p", "hello", `Bonjour ${participant.name} !`), shadow, notMe);
}
