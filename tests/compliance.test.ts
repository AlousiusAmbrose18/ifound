import { test } from "node:test";
import assert from "node:assert/strict";
import {
  similarity,
  nameMatch,
  parseWatchlist,
  mergeWatchlist,
  parseWorkspace,
  validateRules,
  velocityCount,
} from "../lib/compliance.ts";
const rules = {
  threshold: 80,
  amount: 1000000,
  velocity: 5,
  countryWeight: 40,
  locationWeight: 25,
  professionWeight: 35,
  screen: true,
  transaction: true,
};
const person = {
  name: "Alexander Petrov",
  country: "Russia",
  dob: "1982-04-16",
  source: "Demo sanctions",
};
test("matcher handles exact, reordered, accented, fuzzy and non-Latin names", () => {
  assert.equal(similarity("Petrov Alexander", person.name), 100);
  assert.equal(similarity("José", "Jose"), 100);
  assert.ok(similarity("Alexandr Petrov", person.name) >= 80);
  assert.equal(similarity("李 明", "明 李"), 100);
  assert.equal(similarity("", ""), 0);
  assert.ok(similarity("Unrelated Person", person.name) < 80);
});
test("import rejects malformed and oversized records and skips duplicates", () => {
  assert.throws(() => parseWatchlist([{ ...person, source: {} }]));
  assert.throws(() => parseWatchlist([{ ...person, dob: "2024-02-30" }]));
  assert.throws(() => parseWatchlist(Array(10001).fill(person)));
  assert.equal(
    mergeWatchlist([person], [person, { ...person, name: "Other" }]).length,
    2,
  );
});
test("workspace validates all collections and unique IDs", () => {
  const v = {
    alerts: [],
    watch: [person],
    customers: [],
    transactions: [],
    rules,
  };
  assert.deepEqual(parseWorkspace(v), v);
  assert.throws(() =>
    parseWorkspace({
      ...v,
      customers: [{ name: "X", country: "India", dob: "", risk: NaN }],
    }),
  );
  assert.throws(() =>
    parseWorkspace({
      ...v,
      transactions: [
        {
          name: "X",
          destination: "India",
          amount: "-5",
          count: "1",
          flag: false,
        },
      ],
    }),
  );
  assert.throws(() => parseWorkspace({ ...v, alerts: null }));
  assert.equal(validateRules({ ...rules, velocity: 1.5 }), false);
  assert.equal(validateRules({ ...rules, amount: Infinity }), false);
});
test("rolling velocity ignores expired, future, unrelated and legacy records", () => {
  const now = Date.now();
  const t = {
    name: "Alice",
    destination: "India",
    amount: "10",
    count: "1",
    flag: false,
  };
  assert.equal(
    velocityCount(
      [
        { ...t, at: new Date(now - 1000).toISOString() },
        { ...t, at: new Date(now - 86400001).toISOString() },
        { ...t, at: new Date(now + 1000).toISOString() },
        { ...t, name: "Bob", at: new Date(now).toISOString() },
        t,
      ],
      " ALICE ",
      now,
    ),
    2,
  );
});

test("phonetic name parts match Messi Leonel without unrelated token collisions", () => {
  for (const input of ["messy", "mesi", "leoneel", "messy leoneel"]) {
    const match = nameMatch(input, "messi leonel");
    assert.ok(match.score >= 80, input);
    assert.equal(match.matchMethod, "Phonetic token match");
    assert.ok(match.matchedTokens.length > 0);
  }
  for (const input of ["John Smith", "messy smith", "me", "Mase"]) {
    assert.ok(nameMatch(input, "messi leonel").score < 80, input);
  }
  assert.equal(nameMatch("Leonel Messi", "Messi Leonel").score, 100);
  assert.equal(nameMatch("李 明", "明 李").score, 100);
  assert.equal(nameMatch("messy", "messi leonel").score, 90);
});
