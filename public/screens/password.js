// Waiting screen of the password (S2, S3), replaced by task 9 of docs/plans/tirage.md.

/**
 * @typedef {object} PasswordContext
 * @property {{ id: string, name: string }} participant The participant touched on the home page.
 * @property {boolean} hasPassword Answer of POST /api/participant: S3 if true, S2 otherwise.
 * @property {() => void} home Comes back to the home page and forgets everything.
 * @property {() => () => boolean} turn To call before each call of call.js, and to give to
 *   call() as its third argument: the function it returns says, once the answer is there,
 *   whether it is still the last one asked for; if not, the answer is ignored and no banner is
 *   shown, so that it does not replace a newer screen.
 * @property {(receiver: string) => void} gift Shows the gift screen with the name drawn.
 */

/**
 * Fills the screen of the password.
 * @param {HTMLElement} root
 * @param {PasswordContext} context
 */
export function showPassword(root, context) {
  const hello = document.createElement("p");
  hello.className = "hello";
  hello.textContent = `Bonjour ${context.participant.name} !`;
  const notMe = document.createElement("button");
  notMe.type = "button";
  notMe.className = "link";
  notMe.textContent = "Ce n'est pas moi";
  notMe.addEventListener("click", context.home);
  root.append(hello, notMe);
}
