// Waiting screen of the gift (S4), replaced by task 10 of docs/plans/tirage.md.

/**
 * @typedef {object} GiftContext
 * @property {string} receiver The name drawn, to show once the gift is open.
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
