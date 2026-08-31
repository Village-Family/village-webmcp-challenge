import assert from "node:assert/strict";
import test from "node:test";

import {
  commitEditShiftPattern, commitPatternException, commitShiftPattern, commitStopShiftPattern, createPatternState,
  materializePattern, previewEditShiftPattern, previewPatternException, previewShiftPattern, previewStopShiftPattern,
} from "../lib/shift-pattern-engine.mjs";
import { createShiftPatternWebMcpTools } from "../lib/shift-pattern-webmcp-tools.mjs";

const definitions = [
  { code: "early", label: "Early shift", start: "06:00", end: "14:00" },
  { code: "late", label: "Late shift", start: "14:00", end: "22:00" },
  { code: "night", label: "Night shift", start: "22:00", end: "06:00" },
];
const sequence = ["early", "early", "late", "late", "night", "night", "off", "off", "off", "off"];

function preview(overrides = {}) {
  return previewShiftPattern({
    person: "Tash", startDate: "2026-09-01", sequence, definitions,
    repeat: { mode: "cycles", cycles: 2 }, householdMembers: ["John", "Tash", "Alex", "Sam"], ...overrides,
  });
}

test("previews Tash's 6-on 4-off sequence without copying calendar events", () => {
  const result = preview();
  assert.equal(result.ok, true);
  assert.equal(result.cycleLengthDays, 10);
  assert.equal(result.shiftDaysPerCycle, 6);
  assert.equal(result.totalDays, 20);
  assert.equal(result.estimatedShifts, 12);
  assert.equal(result.sampleShifts.length, 10);
  assert.match(result.planId, /^pattern-plan-[a-f0-9]{8}$/);
});

test("supports an indefinite pattern that continues until stopped", () => {
  const result = preview({ repeat: { mode: "indefinite" } });
  assert.equal(result.endDate, null);
  assert.equal(result.estimatedShifts, null);
  assert.match(result.summary, /continuing until stopped/);
});

test("normalises night shifts across midnight in Europe London wall time", () => {
  const result = preview();
  const night = result.sampleShifts.find(shift => shift.code === "night");
  assert.equal(night.overnight, true);
  assert.equal(night.endDate, "2026-09-06");
  assert.equal(night.timezone, "Europe/London");
});

test("requires explicit confirmation and commits a compact recurrence rule", () => {
  const state = createPatternState();
  const plan = preview();
  const blocked = commitShiftPattern(state, plan, { confirmed: false, idempotencyKey: "pattern-1" });
  assert.equal(blocked.result.code, "CONFIRMATION_REQUIRED");
  assert.equal(blocked.state.patterns.length, 0);
  const committed = commitShiftPattern(state, plan, { confirmed: true, idempotencyKey: "pattern-1" });
  assert.equal(committed.result.ok, true);
  assert.equal(committed.state.patterns.length, 1);
  assert.equal(committed.state.patterns[0].sequence.length, 10);
});

test("materialises only the requested calendar window", () => {
  const state = createPatternState();
  const committed = commitShiftPattern(state, preview({ repeat: { mode: "indefinite" } }), {
    confirmed: true, idempotencyKey: "pattern-1",
  });
  const result = materializePattern(committed.state.patterns[0], { from: "2026-09-01", to: "2026-09-10" });
  assert.equal(result.shifts.length, 6);
  assert.deepEqual(result.shifts.map(shift => shift.code), ["early", "early", "late", "late", "night", "night"]);
});

test("rejects overlapping patterns for the same person", () => {
  const first = commitShiftPattern(createPatternState(), preview(), { confirmed: true, idempotencyKey: "first" });
  const second = previewShiftPattern({
    person: "Tash", startDate: "2026-09-15", sequence, definitions,
    repeat: { mode: "cycles", cycles: 1 }, householdRevision: first.state.revision,
    existingPatterns: first.state.patterns, householdMembers: ["John", "Tash"],
  });
  assert.equal(second.code, "PATTERN_RANGE_OVERLAP");
});

test("rejects stale plans and conflicting idempotency keys", () => {
  const plan = preview();
  const stale = commitShiftPattern({ ...createPatternState(), revision: 1 }, plan, {
    confirmed: true, idempotencyKey: "pattern-1",
  });
  assert.equal(stale.result.code, "PATTERN_PLAN_STALE");
  const first = commitShiftPattern(createPatternState(), plan, { confirmed: true, idempotencyKey: "pattern-1" });
  const other = preview({ person: "John", householdRevision: 1 });
  const conflict = commitShiftPattern(first.state, other, { confirmed: true, idempotencyKey: "pattern-1" });
  assert.equal(conflict.result.code, "IDEMPOTENCY_KEY_CONFLICT");
});

test("rejects unknown codes, all-off patterns and unbounded materialisation", () => {
  assert.equal(preview({ sequence: ["mystery"] }).code, "UNKNOWN_SHIFT_CODE");
  assert.equal(preview({ sequence: ["off", "off"] }).code, "PATTERN_HAS_NO_SHIFTS");
  const committed = commitShiftPattern(createPatternState(), preview({ repeat: { mode: "indefinite" } }), {
    confirmed: true, idempotencyKey: "pattern-1",
  });
  assert.equal(materializePattern(committed.state.patterns[0], {
    from: "2026-01-01", to: "2027-12-31",
  }).code, "MATERIALIZATION_RANGE_TOO_LARGE");
});

test("exposes a complete confirmation-gated WebMCP pattern workflow", async () => {
  const { tools } = createShiftPatternWebMcpTools();
  assert.deepEqual(tools.map(tool => tool.name), [
    "preview_shift_pattern", "commit_shift_pattern", "get_shift_patterns", "get_pattern_shifts",
    "preview_pattern_exception", "commit_pattern_exception",
    "preview_stop_shift_pattern", "commit_stop_shift_pattern",
    "preview_pattern_edit", "commit_pattern_edit",
  ]);
  const byName = name => tools.find(tool => tool.name === name);
  const plan = await byName("preview_shift_pattern").execute({
    person: "Tash", start_date: "2026-09-01", sequence, definitions,
    repeat_mode: "indefinite",
  });
  const consent = await byName("commit_shift_pattern").execute({
    plan_id: plan.planId, idempotency_key: "tash-6-on-4-off", confirmed: false,
  });
  assert.equal(consent.code, "CONFIRMATION_REQUIRED");
  const saved = await byName("commit_shift_pattern").execute({
    plan_id: plan.planId, idempotency_key: "tash-6-on-4-off", confirmed: true,
  });
  const shifts = await byName("get_pattern_shifts").execute({
    pattern_id: saved.pattern_id, from: "2026-09-01", to: "2026-09-10",
  });
  assert.equal(shifts.shifts.length, 6);
});

test("supports arbitrary household members without hardcoded names", () => {
  const result = preview({ person: "Alex", householdMembers: ["Alex", "Sam"] });
  assert.equal(result.ok, true);
  const outsider = preview({ person: "Tash", householdMembers: ["Alex", "Sam"] });
  assert.equal(outsider.code, "UNKNOWN_PERSON");
  assert.deepEqual(outsider.allowed_people, ["Alex", "Sam"]);
});

test("accepts six-week and twelve-week cycles but rejects day 85", () => {
  const cycle42 = Array.from({ length: 42 }, (_, index) => index % 7 < 5 ? "early" : "off");
  const cycle84 = [...cycle42, ...cycle42];
  assert.equal(preview({ sequence: cycle42 }).ok, true);
  const max = preview({ sequence: cycle84, repeat: { mode: "indefinite" } });
  assert.equal(max.ok, true);
  const committed = commitShiftPattern(createPatternState(), max, { confirmed: true, idempotencyKey: "84-day-cycle" });
  const boundary = materializePattern(committed.state.patterns[0], { from: "2026-11-23", to: "2026-11-24" });
  assert.equal(boundary.ok, true);
  assert.equal(preview({ sequence: [...cycle84, "early"] }).code, "INVALID_PATTERN_SEQUENCE");
});

test("changes one occurrence without rewriting the repeating series", () => {
  const created = commitShiftPattern(createPatternState(), preview({ repeat: { mode: "indefinite" } }), {
    confirmed: true, idempotencyKey: "base-pattern",
  });
  const pattern = created.state.patterns[0];
  const plan = previewPatternException({
    pattern, date: "2026-09-03", code: "off", householdRevision: created.state.revision,
  });
  assert.match(plan.summary, /rest day/);
  const blocked = commitPatternException(created.state, plan, { confirmed: false, idempotencyKey: "one-off" });
  assert.equal(blocked.result.code, "CONFIRMATION_REQUIRED");
  const saved = commitPatternException(created.state, plan, { confirmed: true, idempotencyKey: "one-off" });
  const shifts = materializePattern(saved.state.patterns[0], { from: "2026-09-01", to: "2026-09-04" });
  assert.deepEqual(shifts.shifts.map(item => item.date), ["2026-09-01", "2026-09-02", "2026-09-04"]);
  assert.equal(saved.state.patterns[0].sequence.length, 10);
});

test("stops an indefinite pattern from a confirmed date and preserves history", () => {
  const created = commitShiftPattern(createPatternState(), preview({ repeat: { mode: "indefinite" } }), {
    confirmed: true, idempotencyKey: "base-pattern",
  });
  const pattern = created.state.patterns[0];
  const plan = previewStopShiftPattern({
    pattern, effectiveDate: "2026-09-06", householdRevision: created.state.revision,
  });
  const stopped = commitStopShiftPattern(created.state, plan, { confirmed: true, idempotencyKey: "stop-pattern" });
  assert.equal(stopped.result.stops_on, "2026-09-06");
  const shifts = materializePattern(stopped.state.patterns[0], { from: "2026-09-01", to: "2026-09-10" });
  assert.equal(shifts.shifts.every(item => item.date < "2026-09-06"), true);
  const replay = commitStopShiftPattern(stopped.state, plan, { confirmed: true, idempotencyKey: "stop-pattern" });
  assert.equal(replay.result.idempotent, true);
});

test("edits this and future shifts without rewriting pattern history", () => {
  const created = commitShiftPattern(createPatternState(), preview({ repeat: { mode: "indefinite" } }), {
    confirmed: true, idempotencyKey: "base-pattern",
  });
  const newDefinitions = [{ code: "day", label: "Day shift", start: "08:00", end: "16:00" }];
  const plan = previewEditShiftPattern({
    pattern: created.state.patterns[0], scope: "this_and_future", effectiveDate: "2026-09-05",
    sequence: ["day", "off"], definitions: newDefinitions, repeat: { mode: "indefinite" },
    householdRevision: created.state.revision, existingPatterns: created.state.patterns,
    householdMembers: ["John", "Tash"],
  });
  assert.match(plan.summary, /Earlier shifts stay unchanged/);
  const blocked = commitEditShiftPattern(created.state, plan, { confirmed: false, idempotencyKey: "future-edit" });
  assert.equal(blocked.result.code, "CONFIRMATION_REQUIRED");
  const edited = commitEditShiftPattern(created.state, plan, { confirmed: true, idempotencyKey: "future-edit" });
  assert.equal(edited.state.patterns.length, 2);
  assert.equal(edited.state.patterns[0].endDate, "2026-09-04");
  assert.equal(edited.state.patterns[1].startDate, "2026-09-05");
  const oldShifts = materializePattern(edited.state.patterns[0], { from: "2026-09-01", to: "2026-09-10" });
  const newShifts = materializePattern(edited.state.patterns[1], { from: "2026-09-01", to: "2026-09-10" });
  assert.equal(oldShifts.shifts.every(item => item.date < "2026-09-05"), true);
  assert.equal(newShifts.shifts.every(item => item.date >= "2026-09-05" && item.code === "day"), true);
  const replay = commitEditShiftPattern(edited.state, plan, { confirmed: true, idempotencyKey: "future-edit" });
  assert.equal(replay.result.idempotent, true);
});

test("entire-series edits are explicit and stale edits are rejected", () => {
  const created = commitShiftPattern(createPatternState(), preview({ repeat: { mode: "indefinite" } }), {
    confirmed: true, idempotencyKey: "base-pattern",
  });
  const plan = previewEditShiftPattern({
    pattern: created.state.patterns[0], scope: "entire_series",
    sequence: ["early", "off"], definitions, repeat: { mode: "cycles", cycles: 3 },
    householdRevision: created.state.revision, existingPatterns: created.state.patterns,
    householdMembers: ["John", "Tash"],
  });
  assert.match(plan.summary, /change past displayed shifts/);
  const stale = commitEditShiftPattern({ ...created.state, revision: 2 }, plan, {
    confirmed: true, idempotencyKey: "whole-edit",
  });
  assert.equal(stale.result.code, "PATTERN_PLAN_STALE");
  const edited = commitEditShiftPattern(created.state, plan, { confirmed: true, idempotencyKey: "whole-edit" });
  assert.equal(edited.state.patterns.length, 1);
  assert.deepEqual(edited.state.patterns[0].sequence, ["early", "off"]);
});

test("replaying the original creation key after an entire_series edit is safe, not a crash", () => {
  const created = commitShiftPattern(createPatternState(), preview({ repeat: { mode: "indefinite" } }), {
    confirmed: true, idempotencyKey: "create-1",
  });
  assert.equal(created.result.ok, true);
  const originalPlan = preview({ repeat: { mode: "indefinite" } });

  const editPlan = previewEditShiftPattern({
    pattern: created.state.patterns[0], scope: "entire_series",
    sequence: ["early", "off"], definitions, repeat: { mode: "cycles", cycles: 3 },
    householdRevision: created.state.revision, existingPatterns: created.state.patterns,
    householdMembers: ["John", "Tash"],
  });
  const edited = commitEditShiftPattern(created.state, editPlan, { confirmed: true, idempotencyKey: "edit-1" });
  assert.equal(edited.result.ok, true);
  // entire_series replaces the pattern in place: same id, but its sourcePlanId no
  // longer matches the original creation plan, which is exactly what previously
  // made the idempotent-replay lookup crash.
  assert.notEqual(edited.state.patterns[0].sourcePlanId, originalPlan.planId);

  assert.doesNotThrow(() => {
    const replay = commitShiftPattern(edited.state, originalPlan, { confirmed: true, idempotencyKey: "create-1" });
    assert.equal(replay.result.ok, true);
    assert.equal(replay.result.idempotent, true);
    assert.equal(replay.result.pattern_id, created.result.pattern_id);
    assert.equal(replay.state.patterns.length, edited.state.patterns.length);
    assert.equal(replay.state, edited.state);
  });
});

test("malformed stored patterns fail honestly instead of throwing", () => {
  const malformed = { id: "pattern-deadbeef", startDate: "2026-09-01", sequence: ["early"], definitions: {} };
  const result = materializePattern(malformed, { from: "2026-09-01", to: "2026-09-02" });
  assert.equal(result.code, "INVALID_STORED_PATTERN");
  assert.equal(result.reason, "INVALID_STORED_SHIFT_DEFINITION");
});
