import test from "node:test";
import assert from "node:assert/strict";
import { buildFamilyScheduleSnapshot, buildUnifiedSchedule, detectChildcareGaps } from "../lib/family-schedule-engine.mjs";

const definitions = {
  early: { code: "early", label: "Early shift", start: "06:00", end: "14:00" },
  late: { code: "late", label: "Late shift", start: "14:00", end: "22:00" },
  night: { code: "night", label: "Night shift", start: "22:00", end: "06:00" },
};

const tashPattern = {
  id: "pattern-tash", person: "Tash", startDate: "2026-08-29", endDate: null,
  sequence: ["early", "early", "late", "late", "night", "night", "off", "off", "off", "off"],
  definitions, timezone: "Europe/London", status: "active",
};

const johnOvertime = {
  id: "john-overtime", person: "John", type: "overtime", label: "Overtime",
  source: "manual", date: "2026-09-01", start: "16:00", end: "22:00",
};

const careWindow = {
  id: "after-school-tue", date: "2026-09-01", start: "15:15", end: "18:30",
  children: ["Ida", "Arlo"], timezone: "Europe/London",
};

test("6-on 4-off pattern becomes visible schedule and creates the real Tuesday gap", () => {
  const snapshot = buildFamilyScheduleSnapshot({
    patterns: [tashPattern], manualEvents: [johnOvertime], importedShifts: [],
    careWindows: [careWindow], guardians: ["John", "Tash"],
    from: "2026-08-31", to: "2026-09-06",
  });
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.schedule.counts.recurring, 4);
  assert.equal(snapshot.coverage.gapFound, true);
  assert.deepEqual(snapshot.coverage.gaps[0].children, ["Ida", "Arlo"]);
  assert.equal(snapshot.coverage.gaps[0].start, "16:00");
  assert.equal(snapshot.coverage.gaps[0].end, "18:30");
  assert.match(snapshot.coverage.gaps[0].reason, /John: Overtime/);
  assert.match(snapshot.coverage.gaps[0].reason, /Tash: Late shift/);
  assert.equal(snapshot.coverage.gaps[0].relayReady, true);
});

test("a reviewed rota scan overrides an identical generated shift without double counting", () => {
  const scanned = {
    id: "scan-late", person: "Tash", type: "shift", label: "Late shift",
    source: "rota_scan", date: "2026-09-01", start: "14:00", endDate: "2026-09-01", end: "22:00",
  };
  const schedule = buildUnifiedSchedule({
    patterns: [tashPattern], importedShifts: [scanned], manualEvents: [],
    from: "2026-09-01", to: "2026-09-01",
  });
  assert.equal(schedule.ok, true);
  assert.equal(schedule.events.length, 1);
  assert.equal(schedule.events[0].source, "rota_scan");
  assert.equal(schedule.counts.duplicatesSuppressed, 1);
});

test("one available guardian means no childcare gap", () => {
  const result = detectChildcareGaps({ events: [johnOvertime], careWindows: [careWindow], guardians: ["John", "Tash"] });
  assert.equal(result.ok, true);
  assert.equal(result.gapFound, false);
});

test("multiple commitments are unioned before guardian overlap is calculated", () => {
  const events = [
    { ...johnOvertime, id: "john-1", start: "15:00", end: "17:00" },
    { ...johnOvertime, id: "john-2", start: "17:00", end: "19:00" },
    { id: "tash-1", person: "Tash", source: "manual", label: "Meeting", date: "2026-09-01", start: "16:30", end: "18:00" },
  ];
  const result = detectChildcareGaps({ events, careWindows: [careWindow], guardians: ["John", "Tash"] });
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].start, "16:30");
  assert.equal(result.gaps[0].end, "18:00");
  assert.deepEqual(new Set(result.gaps[0].causeEventIds), new Set(["john-1", "john-2", "tash-1"]));
});

test("overnight shifts overlap a next-day care window correctly", () => {
  const events = [
    { id: "john-night", person: "John", source: "manual", label: "Night", date: "2026-09-01", start: "22:00", endDate: "2026-09-02", end: "06:00" },
    { id: "tash-early", person: "Tash", source: "manual", label: "Early", date: "2026-09-02", start: "05:00", end: "14:00" },
  ];
  const result = detectChildcareGaps({
    events, guardians: ["John", "Tash"],
    careWindows: [{ id: "morning", date: "2026-09-02", start: "05:30", end: "07:00", children: ["Ida"] }],
  });
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].start, "05:30");
  assert.equal(result.gaps[0].end, "06:00");
});

test("invalid range and care windows fail honestly", () => {
  assert.equal(buildUnifiedSchedule({ from: "2026-09-02", to: "2026-09-01" }).code, "INVALID_SCHEDULE_RANGE");
  assert.equal(detectChildcareGaps({ events: [], careWindows: [{ date: "bad", start: "1pm", end: "2pm" }] }).code, "INVALID_CARE_WINDOW");
});

test("rejects invalid care-window end dates and conflicting event IDs", () => {
  const badWindow = detectChildcareGaps({
    events: [], guardians: ["John"],
    careWindows: [{ id: "care-1", date: "2026-09-01", start: "09:00", endDate: "not-a-date", end: "17:00" }],
  });
  assert.equal(badWindow.code, "INVALID_CARE_WINDOW");
  const duplicate = buildUnifiedSchedule({
    from: "2026-09-01", to: "2026-09-02", patterns: [],
    importedShifts: [{ id: "same", person: "Tash", date: "2026-09-01", start: "06:00", end: "14:00", source: "rota_scan" }],
    manualEvents: [{ id: "same", person: "John", date: "2026-09-01", start: "09:00", end: "17:00", source: "manual" }],
  });
  assert.equal(duplicate.code, "DUPLICATE_EVENT_ID");
});

test("rejects a zero-duration event or care window instead of fabricating a 24-hour block", () => {
  const zeroEvent = buildUnifiedSchedule({
    manualEvents: [{ id: "e1", person: "John", date: "2026-09-01", start: "10:00", end: "10:00", source: "manual", label: "Oops" }],
    from: "2026-09-01", to: "2026-09-01",
  });
  assert.equal(zeroEvent.code, "ZERO_DURATION_EVENT");
  assert.equal(zeroEvent.event_id, "e1");

  const zeroWindow = detectChildcareGaps({
    events: [{ id: "e2", person: "John", date: "2026-09-01", start: "10:00", end: "18:00", source: "manual" }],
    guardians: ["John"],
    careWindows: [{ id: "w1", date: "2026-09-01", start: "09:00", end: "09:00" }],
  });
  assert.equal(zeroWindow.code, "ZERO_DURATION_CARE_WINDOW");
  assert.equal(zeroWindow.window_id, "w1");
});

test("rejects an event whose explicit endDate produces an impossible interval instead of silently dropping it", () => {
  const wrongEndDate = buildUnifiedSchedule({
    manualEvents: [{
      id: "e3", person: "John", date: "2026-09-01",
      start: "22:00", endDate: "2026-09-01", end: "06:00", source: "manual", label: "Night (mis-entered)",
    }],
    from: "2026-09-01", to: "2026-09-02",
  });
  assert.equal(wrongEndDate.code, "INVALID_EVENT_INTERVAL");
  assert.equal(wrongEndDate.event_id, "e3");

  // The same shape but with the correct next-day endDate must still work.
  const correctEndDate = buildUnifiedSchedule({
    manualEvents: [{
      id: "e4", person: "John", date: "2026-09-01",
      start: "22:00", endDate: "2026-09-02", end: "06:00", source: "manual", label: "Night (correct)",
    }],
    from: "2026-09-01", to: "2026-09-02",
  });
  assert.equal(correctEndDate.ok, true);
  assert.equal(correctEndDate.events.length, 1);

  // And an overnight event with no endDate at all must still be legitimately
  // derived onto the next day, exactly as before.
  const derivedOvernight = buildUnifiedSchedule({
    manualEvents: [{
      id: "e5", person: "John", date: "2026-09-01",
      start: "22:00", end: "06:00", source: "manual", label: "Night (derived)",
    }],
    from: "2026-09-01", to: "2026-09-02",
  });
  assert.equal(derivedOvernight.ok, true);
  assert.equal(derivedOvernight.events.length, 1);
});
