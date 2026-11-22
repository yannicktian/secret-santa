// The elements of the screens, built in code: no HTML text is ever parsed.

/**
 * An element with its class and its children.
 * @param {string} tag
 * @param {string} className
 * @param {...(Node | string)} children
 */
export function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

/**
 * A button that is not a form submission.
 * @param {string} className
 * @param {string} text
 * @param {() => void} onClick
 */
export function button(className, text, onClick) {
  const node = element("button", className, text);
  node.setAttribute("type", "button");
  node.addEventListener("click", onClick);
  return node;
}
