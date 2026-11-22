import assert from "node:assert/strict";
import test from "node:test";
import { countdown } from "../../public/countdown.js";

test("the countdown counts the days left at noon in Paris (S1)", () => {
  assert.equal(countdown(new Date("2026-11-22T12:00:00+01:00")), "Plus que 33 jours !");
  assert.equal(countdown(new Date("2026-12-23T12:00:00+01:00")), "Plus que 2 jours !");
  assert.equal(countdown(new Date("2026-12-24T12:00:00+01:00")), "C'est demain !");
  assert.equal(countdown(new Date("2026-12-25T12:00:00+01:00")), "C'est aujourd'hui !");
  assert.equal(countdown(new Date("2026-12-26T12:00:00+01:00")), null);
});

test("the countdown takes the day in Paris, not in UTC", () => {
  assert.equal(countdown(new Date("2026-12-24T23:30:00Z")), "C'est aujourd'hui !");
  assert.equal(countdown(new Date("2026-12-25T23:30:00Z")), null);
  assert.equal(countdown(new Date("2026-11-21T23:30:00Z")), "Plus que 33 jours !");
});

test("the countdown says nothing after Christmas, even long after", () => {
  assert.equal(countdown(new Date("2027-03-01T12:00:00+01:00")), null);
});
