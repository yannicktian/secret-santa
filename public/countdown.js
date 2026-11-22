// The countdown of the home page (S1): days left until December 25th, 2026, in Paris.

const christmas = Date.UTC(2026, 11, 25);
const parisDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The countdown text at an instant, or null from December 26th.
 * @param {Date} now
 * @returns {string | null}
 */
export function countdown(now) {
  const [year, month, day] = parisDay.format(now).split("-").map(Number);
  const days = Math.round((christmas - Date.UTC(year, month - 1, day)) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "C'est aujourd'hui !";
  if (days === 1) return "C'est demain !";
  return `Plus que ${days} jours !`;
}
