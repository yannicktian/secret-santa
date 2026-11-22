import assert from "node:assert/strict";
import test from "node:test";
import { participants } from "../../lib/participants.js";

test("seven participants, in the order of the spec, with their exact names and ids", () => {
  assert.deepEqual(participants, [
    { id: "yannick", name: "Yannick" },
    { id: "lea", name: "Léa" },
    { id: "christine", name: "Christine" },
    { id: "guigui", name: "Guigui" },
    { id: "mamet", name: "Mamet" },
    { id: "anne", name: "Anne" },
    { id: "loulou", name: "Loulou" },
  ]);
});

test("the list cannot be changed at run time", () => {
  assert.ok(Object.isFrozen(participants));
  for (const participant of participants) assert.ok(Object.isFrozen(participant));
});
