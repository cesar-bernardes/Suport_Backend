import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOccurrenceDateTime } from "../api/_lib/occurrence-date-time.ts";

const scenarios = [
  ["2026-09-16T10:30", "2026-09-16T14:30:00.000Z"],
  ["2026-09-15T10:30", "2026-09-15T14:30:00.000Z"],
  ["2026-09-02T08:05", "2026-09-02T12:05:00.000Z"],
  ["2026-09-14T23:30", "2026-09-15T03:30:00.000Z"],
  ["2026-09-14T00:15", "2026-09-14T04:15:00.000Z"],
];

for (const [input, expected] of scenarios) {
  test(`normaliza ${input} no fuso operacional`, () => {
    assert.equal(normalizeOccurrenceDateTime(input), expected);
  });
}

test("preserva um instante que já possui fuso explícito", () => {
  assert.equal(normalizeOccurrenceDateTime("2026-09-14T22:15:00-04:00"), "2026-09-15T02:15:00.000Z");
});

test("rejeita datas e horários inválidos", () => {
  assert.equal(normalizeOccurrenceDateTime("2026-02-30T10:00"), null);
  assert.equal(normalizeOccurrenceDateTime("2026-09-14T24:00"), null);
  assert.equal(normalizeOccurrenceDateTime("14/09/2026 22:15"), null);
});
