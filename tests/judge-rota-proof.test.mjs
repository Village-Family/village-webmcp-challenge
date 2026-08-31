import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createShiftPatternWebMcpTools } from "../lib/shift-pattern-webmcp-tools.mjs";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const PATTERN_ID_SCHEMA = /^pattern-[a-f0-9]{8}$/;

function byName(tools, name) {
  const tool = tools.find(item => item.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool;
}

test("the seeded pattern id shipped in app/page.tsx matches every tool's own pattern_id schema", () => {
  const match = source.match(/tashSixOnFourOff = \{\s*id: "([^"]+)"/);
  assert.ok(match, "could not find the seeded Tash pattern id in app/page.tsx");
  const seededId = match[1];
  assert.match(seededId, PATTERN_ID_SCHEMA);

  // Every tool that accepts a pattern_id declares the same regex; assert none of
  // them silently drifted from what get_shift_patterns would actually hand back.
  const { tools } = createShiftPatternWebMcpTools();
  for (const name of ["get_pattern_shifts", "preview_pattern_exception", "preview_stop_shift_pattern", "preview_pattern_edit"]) {
    const declaredPattern = byName(tools, name).inputSchema.properties.pattern_id.pattern;
    assert.equal(declaredPattern, PATTERN_ID_SCHEMA.source);
    assert.match(seededId, new RegExp(declaredPattern));
  }
});

test("literally exercises JUDGE_GUIDE.md's optional rota proof against the tool factory", async () => {
  const match = source.match(/tashSixOnFourOff = \{\s*id: "([^"]+)"/);
  const seededId = match[1];
  const seedPattern = {
    id: seededId, person: "Tash", startDate: "2026-08-29", endDate: null,
    sequence: ["early", "early", "late", "late", "night", "night", "off", "off", "off", "off"],
    definitions: {
      early: { code: "early", label: "Early", start: "06:00", end: "14:00" },
      late: { code: "late", label: "Late", start: "14:00", end: "22:00" },
      night: { code: "night", label: "Night", start: "22:00", end: "06:00" },
    },
    timezone: "Europe/London", status: "active",
  };

  const { tools } = createShiftPatternWebMcpTools({
    householdMembers: ["John", "Tash"], initialPatterns: [seedPattern],
  });

  // "Show me Tash's repeating pattern..."
  const patterns = await byName(tools, "get_shift_patterns").execute({});
  assert.equal(patterns.ok, true);
  assert.equal(patterns.patterns[0].id, seededId);
  assert.match(patterns.patterns[0].id, PATTERN_ID_SCHEMA);

  // "...then preview changing it from 5 September to Day, Off repeating. Do not save it until I confirm."
  const preview = await byName(tools, "preview_pattern_edit").execute({
    pattern_id: patterns.patterns[0].id, scope: "this_and_future", effective_date: "2026-09-05",
    sequence: ["day", "off"],
    definitions: [{ code: "day", label: "Day", start: "08:00", end: "16:00" }],
    repeat_mode: "indefinite",
  });
  assert.equal(preview.ok, true);
  assert.match(preview.summary, /Earlier shifts stay unchanged/);

  const blocked = await byName(tools, "commit_pattern_edit").execute({
    plan_id: preview.planId, idempotency_key: "judge-rota-proof", confirmed: false,
  });
  assert.equal(blocked.code, "CONFIRMATION_REQUIRED");

  // "Approve it, then read the generated shifts again."
  const committed = await byName(tools, "commit_pattern_edit").execute({
    plan_id: preview.planId, idempotency_key: "judge-rota-proof", confirmed: true,
  });
  assert.equal(committed.ok, true);

  const shifts = await byName(tools, "get_pattern_shifts").execute({
    pattern_id: committed.pattern_id, from: "2026-09-05", to: "2026-09-11",
  });
  assert.equal(shifts.ok, true);
  assert.ok(shifts.shifts.length > 0);
  assert.ok(shifts.shifts.every(shift => shift.code === "day"));

  const earlierShifts = await byName(tools, "get_pattern_shifts").execute({
    pattern_id: seededId, from: "2026-08-29", to: "2026-09-04",
  });
  assert.equal(earlierShifts.ok, true);
  assert.ok(earlierShifts.shifts.length > 0);
});
