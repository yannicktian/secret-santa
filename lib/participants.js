/**
 * @typedef {{ readonly id: string, readonly name: string }} Participant
 */

/**
 * The seven participants, in the order of the spec's scope: id and displayed name.
 * @type {readonly Participant[]}
 */
export const participants = Object.freeze(
  [
    { id: "yannick", name: "Yannick" },
    { id: "lea", name: "Léa" },
    { id: "christine", name: "Christine" },
    { id: "guigui", name: "Guigui" },
    { id: "mamet", name: "Mamet" },
    { id: "anne", name: "Anne" },
    { id: "loulou", name: "Loulou" },
  ].map((participant) => Object.freeze(participant)),
);

/**
 * The participant with this id, or `undefined`.
 * @param {unknown} id
 * @returns {Participant | undefined}
 */
export function findParticipant(id) {
  return participants.find((p) => p.id === id);
}
