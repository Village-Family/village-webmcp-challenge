import assert from "node:assert/strict";
import test from "node:test";

import { buildRotaPreview as buildRotaPreviewCore, commitRotaPreview, createRotaState } from "../lib/rota-import-engine.mjs";

const buildRotaPreview = input => buildRotaPreviewCore({
  householdMembers: ["John", "Tash", "Alex", "Sam"], ...input,
});

const cleanCandidates = [
  { sourceRowId: "mon", date: "2026-08-31", start: "07:00", end: "15:00", label: "Day shift", confidence: 0.98 },
  { sourceRowId: "tue", date: "2026-09-01", start: "14:00", end: "22:00", label: "Late shift", confidence: 0.96 },
];

test("creates a confirmation-gated preview from clean extracted shifts", () => {
  const preview = buildRotaPreview({ candidates: cleanCandidates, person: "John", householdRevision: 3 });
  assert.equal(preview.ok, true);
  assert.equal(preview.canCommit, true);
  assert.equal(preview.counts.ready, 2);
  assert.equal(preview.baseRevision, 3);
  assert.match(preview.planId, /^rota-plan-[a-f0-9]{8}$/);
});

test("normalises an overnight shift onto the following end date", () => {
  const preview = buildRotaPreview({
    person: "Tash",
    candidates: [{ sourceRowId: "night", date: "2026-09-02", start: "22:00", end: "06:00", confidence: 0.99 }],
  });
  assert.equal(preview.rows[0].overnight, true);
  assert.equal(preview.rows[0].endDate, "2026-09-03");
  assert.equal(preview.rows[0].durationMinutes, 480);
});

test("forces low-confidence OCR rows through human review", () => {
  const preview = buildRotaPreview({
    person: "John",
    candidates: [{ sourceRowId: "blurred", date: "2026-09-04", start: "07:00", end: "15:00", confidence: 0.61 }],
  });
  assert.equal(preview.rows[0].status, "needs_review");
  assert.deepEqual(preview.rows[0].warnings, ["LOW_CONFIDENCE"]);
  assert.equal(preview.canCommit, false);
});

test("rejects impossible dates, times and dangerously long shifts", () => {
  const invalid = buildRotaPreview({
    person: "John",
    candidates: [{ sourceRowId: "bad", date: "2026-02-30", start: "29:00", end: "06:00", confidence: 1 }],
  });
  assert.equal(invalid.rows[0].status, "invalid");
  assert.ok(invalid.rows[0].errors.includes("INVALID_DATE"));
  assert.ok(invalid.rows[0].errors.includes("INVALID_START_TIME"));

  const long = buildRotaPreview({
    person: "John",
    candidates: [{ sourceRowId: "long", date: "2026-09-01", start: "07:00", end: "06:30", confidence: 1 }],
  });
  assert.ok(long.rows[0].errors.includes("SHIFT_TOO_LONG"));
});

test("detects duplicates against the calendar and within one scan", () => {
  const existing = [{ person: "John", date: "2026-08-31", start: "07:00", endDate: "2026-08-31", end: "15:00" }];
  const preview = buildRotaPreview({
    candidates: [cleanCandidates[0], cleanCandidates[1], { ...cleanCandidates[1], sourceRowId: "tue-copy" }],
    existingEvents: existing,
    person: "John",
  });
  assert.deepEqual(preview.rows.map(row => row.status), ["duplicate", "ready", "duplicate"]);
  assert.equal(preview.counts.duplicate, 2);
});

test("rejects duplicate source row IDs before they can collide as calendar event IDs", () => {
  const preview = buildRotaPreview({
    person: "John",
    candidates: [
      cleanCandidates[0],
      { ...cleanCandidates[1], sourceRowId: cleanCandidates[0].sourceRowId },
    ],
  });
  assert.equal(preview.rows[1].status, "invalid");
  assert.ok(preview.rows[1].errors.includes("DUPLICATE_SOURCE_ROW_ID"));
  assert.equal(preview.canCommit, false);
});

test("binds plan identity to confidence, warnings and source evidence", () => {
  const baseline = buildRotaPreview({ person: "John", candidates: cleanCandidates });
  const changedEvidence = buildRotaPreview({
    person: "John",
    candidates: [{ ...cleanCandidates[0], sourceText: "MON 7-3" }, cleanCandidates[1]],
  });
  assert.notEqual(baseline.planId, changedEvidence.planId);
});

test("bounds untrusted OCR text and ambiguity metadata", () => {
  const preview = buildRotaPreview({
    person: "John",
    candidates: [{
      ...cleanCandidates[0],
      sourceText: "x".repeat(241),
      ambiguityFlags: Array.from({ length: 9 }, (_, index) => `flag-${index}`),
    }],
  });
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.includes("SOURCE_TEXT_TOO_LONG"));
  assert.ok(preview.rows[0].errors.includes("INVALID_AMBIGUITY_FLAGS"));
});

test("never commits until the exact reviewed preview is confirmed", () => {
  const state = createRotaState();
  const preview = buildRotaPreview({ candidates: cleanCandidates, person: "John", householdRevision: state.revision });
  const blocked = commitRotaPreview(state, preview, { confirmed: false, idempotencyKey: "scan-1" });
  assert.equal(blocked.result.code, "CONFIRMATION_REQUIRED");
  assert.equal(blocked.state, state);
  assert.equal(blocked.state.scheduleEvents.length, 0);
});

test("commits all reviewed shifts atomically with stable provenance", () => {
  const state = createRotaState();
  const preview = buildRotaPreview({ candidates: cleanCandidates, person: "John", householdRevision: state.revision });
  const committed = commitRotaPreview(state, preview, { confirmed: true, idempotencyKey: "scan-1" });
  assert.equal(committed.result.ok, true);
  assert.equal(committed.result.imported, 2);
  assert.equal(committed.state.revision, 1);
  assert.equal(committed.state.scheduleEvents.length, 2);
  assert.ok(committed.state.scheduleEvents.every(event => event.source === "rota_scan" && event.sourcePlanId === preview.planId));
});

test("is duplicate-safe but rejects an idempotency key reused for another scan", () => {
  const initial = createRotaState();
  const preview = buildRotaPreview({ candidates: cleanCandidates, person: "John", householdRevision: 0 });
  const first = commitRotaPreview(initial, preview, { confirmed: true, idempotencyKey: "scan-1" });
  const replay = commitRotaPreview(first.state, preview, { confirmed: true, idempotencyKey: "scan-1" });
  assert.equal(replay.result.idempotent, true);
  assert.equal(replay.state.scheduleEvents.length, 2);

  const other = buildRotaPreview({
    person: "Tash",
    householdRevision: first.state.revision,
    candidates: [{ sourceRowId: "wed", date: "2026-09-02", start: "09:00", end: "17:00", confidence: 0.99 }],
  });
  const conflict = commitRotaPreview(first.state, other, { confirmed: true, idempotencyKey: "scan-1" });
  assert.equal(conflict.result.code, "IDEMPOTENCY_KEY_CONFLICT");
});

test("rejects a preview when the household changed before confirmation", () => {
  const preview = buildRotaPreview({ candidates: cleanCandidates, person: "John", householdRevision: 0 });
  const changed = { ...createRotaState(), revision: 1 };
  const result = commitRotaPreview(changed, preview, { confirmed: true, idempotencyKey: "scan-1" });
  assert.equal(result.result.code, "IMPORT_PLAN_STALE");
  assert.equal(result.state.scheduleEvents.length, 0);
});

test("authorises any configured household member and rejects outsiders", () => {
  const alex = buildRotaPreview({ person: "Alex", candidates: cleanCandidates, householdMembers: ["Alex", "Sam"] });
  assert.equal(alex.ok, true);
  const outsider = buildRotaPreview({ person: "John", candidates: cleanCandidates, householdMembers: ["Alex", "Sam"] });
  assert.equal(outsider.code, "UNKNOWN_PERSON");
  assert.deepEqual(outsider.allowed_people, ["Alex", "Sam"]);
});
