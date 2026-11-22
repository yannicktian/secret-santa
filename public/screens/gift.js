// Waiting screen of the gift (S4), replaced by task 10 of docs/plans/tirage.md.

/**
 * @typedef {object} GiftContext
 * @property {string} receiver The name drawn, to show once the gift is open.
 * @property {() => () => boolean} turn To call before each call of call.js, and to give to
 *   call() as its third argument: the function it returns says, once the answer is there,
 *   whether it is still the last one asked for; if not, the answer is ignored and no banner is
 *   shown, so that it does not replace a newer screen.
 * @property {() => void} home Comes back to the home page and forgets everything.
 */

/**
 * Fills the screen of the gift.
 * @param {HTMLElement} root
 * @param {GiftContext} context
 */
export function showGift(root, context) {
  const back = document.createElement("button");
  back.type = "button";
  back.className = "btn plain";
  back.textContent = "Retour à l'accueil";
  back.addEventListener("click", context.home);
  root.append(back);
}
