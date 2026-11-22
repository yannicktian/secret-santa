import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { makeDraw } from "../../lib/draw.js";
import { participants } from "../../lib/participants.js";

const IDS = participants.map((participant) => participant.id);

/** Draws possible for seven participants: the derangements of seven. */
const POSSIBLE_DRAWS = 1854;
/** Expected count of each possible draw. */
const EXPECTED = 100;
const DRAWS = POSSIBLE_DRAWS * EXPECTED;
/**
 * Chi-square at 1 853 degrees of freedom whose chance of being exceeded by a uniform
 * draw is below one in a million.
 */
const CHI_SQUARE_LIMIT = 2142;

/**
 * A seeded generator (mulberry32), returning a `randomInt(max)` in [0, max).
 * @param {number} seed
 * @returns {(max: number) => number}
 */
function seededRandomInt(seed) {
  let state = seed >>> 0;
  return (max) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * max);
  };
}

/**
 * Sattolo's algorithm: a biased draw that only ever makes a single cycle.
 * @param {readonly string[]} ids
 * @param {(max: number) => number} randomInt
 * @returns {Record<string, string>}
 */
function sattoloDraw(ids, randomInt) {
  const receivers = [...ids];
  for (let i = receivers.length - 1; i > 0; i--) {
    const j = randomInt(i);
    [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
  }
  return Object.fromEntries(ids.map((id, index) => [id, receivers[index]]));
}

/**
 * Runs `DRAWS` simulated draws and counts each distinct one.
 * @param {(ids: readonly string[], randomInt: (max: number) => number) => Record<string, string>} draw
 */
function simulate(draw) {
  const randomInt = seededRandomInt(20261225);
  /** @type {Map<string, number>} */
  const counts = new Map();
  let fixedPoints = 0;
  let reciprocalPairs = 0;
  for (let n = 0; n < DRAWS; n++) {
    const result = draw(IDS, randomInt);
    if (IDS.some((id) => result[id] === id)) fixedPoints++;
    if (IDS.some((id) => result[id] !== id && result[result[id]] === id)) reciprocalPairs++;
    const key = IDS.map((id) => result[id]).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let chiSquare = 0;
  for (const count of counts.values()) chiSquare += (count - EXPECTED) ** 2 / EXPECTED;
  chiSquare += (POSSIBLE_DRAWS - counts.size) * EXPECTED;
  return { distinct: counts.size, fixedPoints, reciprocalPairs, chiSquare };
}

/**
 * @param {ReturnType<typeof simulate>} report
 */
function isUniformDerangement(report) {
  return (
    report.distinct === POSSIBLE_DRAWS &&
    report.fixedPoints === 0 &&
    report.chiSquare < CHI_SQUARE_LIMIT
  );
}

/** @type {ReturnType<typeof simulate> | undefined} */
let makeDrawReport;
function simulateMakeDraw() {
  makeDrawReport ??= simulate(makeDraw);
  return makeDrawReport;
}

test("every possible draw comes out equally often, none with a fixed point (S7, D8)", () => {
  const report = simulateMakeDraw();
  assert.equal(report.distinct, POSSIBLE_DRAWS);
  assert.equal(report.fixedPoints, 0);
  assert.ok(report.chiSquare < CHI_SQUARE_LIMIT, `chi-square ${report.chiSquare}`);
  assert.ok(isUniformDerangement(report));
});

test("draws where two people give to each other come out (D8)", () => {
  assert.ok(simulateMakeDraw().reciprocalPairs > 0);
});

test("the same check fails on a biased draw (Sattolo)", () => {
  const report = simulate(sattoloDraw);
  assert.equal(report.fixedPoints, 0);
  assert.equal(isUniformDerangement(report), false);
});

test("each participant gives once and receives once, never to himself", () => {
  const randomInt = seededRandomInt(1);
  for (let n = 0; n < 1000; n++) {
    const draw = makeDraw(IDS, randomInt);
    assert.deepEqual(Object.keys(draw).sort(), [...IDS].sort());
    assert.deepEqual(Object.values(draw).sort(), [...IDS].sort());
    for (const id of IDS) assert.notEqual(draw[id], id);
  }
});

test("crypto.randomInt is the default generator", (t) => {
  const randomInt = t.mock.method(crypto, "randomInt");
  const draw = makeDraw(IDS);
  assert.ok(randomInt.mock.callCount() > 0);
  for (const id of IDS) assert.notEqual(draw[id], id);
});

test("fewer than two participants cannot make a draw", () => {
  assert.throws(() => makeDraw(["yannick"]), RangeError);
  assert.throws(() => makeDraw([]), RangeError);
});
