import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../../public/style.css", import.meta.url), "utf8");

/** The colours of :root in style.css, by name. */
const colours = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
);

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} a
 * @param {string} b
 */
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Each text of the screens, its colour and its background. Large text (badges: 19.2 px bold)
// needs 3:1, the rest 4.5:1 (WCAG AA).
const pairs = [
  ["snow", "night", 4.5, "titles, links and lead texts on the night sky"],
  ["snow", "night-2", 4.5, "titles and links on the top of the sky"],
  ["gold", "night", 4.5, "Qui es-tu ?"],
  ["gold", "night-2", 4.5, "Qui es-tu ?, top of the sky"],
  ["ink", "paper", 4.5, "panel text, plain and player buttons"],
  ["muted", "paper", 4.5, "hints, arrows, states"],
  ["berry", "paper", 4.5, "countdown, name drawn"],
  ["holly", "paper", 4.5, "state « Mot de passe choisi »"],
  ["ink", "gold", 4.5, "gold buttons"],
  ["ink", "paper-2", 4.5, "fields"],
  ["white", "holly", 4.5, "primary buttons"],
  ["white", "berry", 4.5, "danger buttons"],
  ["berry-dark", "error-bg", 4.5, "error messages"],
  ["ok-ink", "ok-bg", 4.5, "confirmation messages"],
  ["ice", "night-2", 4.5, "admin tag"],
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => ["white", `badge-${i}`, 3, `badge ${i}`]),
];

test("each text of style.css reaches the WCAG AA contrast", () => {
  for (const [text, background, minimum, where] of pairs) {
    const a = colours[text];
    const b = colours[background];
    assert.ok(a && b, `colours --${text} and --${background} are in style.css`);
    const value = ratio(a, b);
    assert.ok(value >= Number(minimum), `${where}: ${value.toFixed(2)} < ${minimum}`);
  }
});
