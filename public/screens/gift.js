// The screen of the gift (S4): a pixel gift, closed; touched, it shakes, its lid opens with
// confetti, then the name drawn is shown. Opened at once when the device asks for less motion.

/**
 * @typedef {object} GiftContext
 * @property {string} receiver The name drawn, to show once the gift is open.
 * @property {() => () => boolean} turn To call before each call of call.js, and to give to
 *   call() as its third argument: the function it returns says, once the answer is there,
 *   whether it is still the last one asked for; if not, the answer is ignored and no banner is
 *   shown, so that it does not replace a newer screen.
 * @property {() => void} home Comes back to the home page and forgets everything.
 */

/** The pixels of the gift, 16 × 16: the lid on rows 0 to 7, the box on rows 8 to 15. */
const lid = [
  "...KK......KK...",
  "..KGGK....KGGK..",
  "..KGGGK..KGGGK..",
  "...KGGGKKGGGK...",
  "KKKKKKKGGKKKKKKK",
  "KRRRRRRGGRRRRRRK",
  "KRWRRRRGGRRRRRDK",
  "KKKKKKKGGKKKKKKK",
];
const box = [
  ".KRRRRRGGRRRRRK.",
  ".KRWRRRGGRRRRDK.",
  ".KRRRRRGGRRRRDK.",
  ".KRRRRRGGRRRRDK.",
  ".KRRRRRGGRRRRDK.",
  ".KRRRRRGGRRRRDK.",
  ".KRRRRRGGRRRDDK.",
  ".KKKKKKKKKKKKKK.",
];
/** @type {Record<string, string>} */
const palette = { K: "#141a2e", R: "#c8283c", D: "#8f1526", G: "#ffc83d", W: "#ff8a96" };
const confettiColors = ["--gold", "--berry", "--holly", "--ice", "--white"];

/** Shake, then the lid opens; then the name. In milliseconds, as in the mockup. */
const shakeTime = 500;
const openTime = 1000;
const confettiTime = 1200;

const svgns = "http://www.w3.org/2000/svg";

/**
 * A group of pixels.
 * @param {string[]} rows
 * @param {number} top
 */
function pixels(rows, top) {
  const group = document.createElementNS(svgns, "g");
  rows.forEach((row, y) => {
    [...row].forEach((code, x) => {
      const color = palette[code];
      if (!color) return;
      const rect = document.createElementNS(svgns, "rect");
      const attributes = { x, y: y + top, width: 1.02, height: 1.02, fill: color };
      for (const [name, value] of Object.entries(attributes)) {
        rect.setAttribute(name, String(value));
      }
      group.append(rect);
    });
  });
  return group;
}

/** The pixel gift, its lid in the class "lid". */
function drawing() {
  const svg = document.createElementNS(svgns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  const top = pixels(lid, 0);
  top.setAttribute("class", "lid");
  svg.append(pixels(box, 8), top);
  return svg;
}

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
 * Throws confetti from the top of the gift; each one is removed once fallen.
 * @param {Element} from
 */
function burst(from) {
  const r = from.getBoundingClientRect();
  for (let i = 0; i < 26; i += 1) {
    const piece = element("span", "confetti");
    const angle = Math.random() * Math.PI * 2;
    const distance = 70 + Math.random() * 110;
    piece.style.background = `var(${confettiColors[i % confettiColors.length]})`;
    piece.style.left = `${r.left + r.width / 2}px`;
    piece.style.top = `${r.top + r.height * 0.35}px`;
    piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * distance - 60}px`);
    document.body.append(piece);
    setTimeout(() => piece.remove(), confettiTime);
  }
}

/**
 * The gift opened: the name drawn and « Retour à l'accueil ».
 * @param {HTMLElement} root
 * @param {GiftContext} context
 */
function showOpened(root, context) {
  const opened = element("div", "giftbtn small open", drawing());
  const back = element("button", "btn plain", "Retour à l'accueil");
  back.setAttribute("type", "button");
  back.addEventListener("click", context.home);
  root.replaceChildren(
    element(
      "div",
      "gift-wrap opened",
      opened,
      element(
        "div",
        "shadow wide",
        element(
          "div",
          "panel reveal",
          element("p", "to", "Tu offres ton cadeau à"),
          element("p", "name", context.receiver),
          element("p", "", "Garde le secret jusqu'au 25 décembre !"),
        ),
      ),
      back,
    ),
  );
}

/**
 * Fills the screen of the gift.
 * @param {HTMLElement} root
 * @param {GiftContext} context
 */
export function showGift(root, context) {
  const hint = element("p", "lead", element("strong", "", "Touche le paquet pour l'ouvrir."));
  hint.id = "gift-hint";
  const gift = element("button", "giftbtn idle", drawing());
  gift.setAttribute("type", "button");
  gift.setAttribute("aria-labelledby", "gift-hint");
  let touched = false;
  gift.addEventListener("click", () => {
    if (touched) return;
    touched = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      showOpened(root, context);
      return;
    }
    // Back to the home page from the cache of the browser, meanwhile: nothing more is shown.
    const isCurrent = context.turn();
    gift.classList.replace("idle", "shake");
    setTimeout(() => {
      if (!isCurrent()) return;
      gift.classList.add("open");
      burst(gift);
    }, shakeTime);
    setTimeout(() => {
      if (isCurrent()) showOpened(root, context);
    }, openTime);
  });
  root.append(
    element(
      "div",
      "gift-wrap closed",
      element("p", "lead", "Ton tirage est dans ce paquet."),
      gift,
      hint,
    ),
  );
}
