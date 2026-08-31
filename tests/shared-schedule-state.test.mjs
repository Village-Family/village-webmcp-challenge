import test from "node:test";
import assert from "node:assert/strict";
import { createRotaWebMcpTools } from "../lib/rota-webmcp-tools.mjs";
import { createShiftPatternWebMcpTools } from "../lib/shift-pattern-webmcp-tools.mjs";

const definitions = [{ code: "day", label: "Day", start: "08:00", end: "16:00" }];

function byName(adapter, name) {
  return adapter.tools.find(tool => tool.name === name);
}

test("rota and pattern plans share one household revision", async () => {
  let revision = 0;
  const options = {
    householdMembers: ["Alex", "Sam"],
    getHouseholdRevision: () => revision,
    onStateChange: state => { revision = state.revision; },
  };
  const rota = createRotaWebMcpTools(options);
  const patterns = createShiftPatternWebMcpTools(options);

  const patternPlan = await byName(patterns, "preview_shift_pattern").execute({
    person: "Alex", start_date: "2026-09-01", sequence: ["day", "off"], definitions,
    repeat_mode: "indefinite",
  });
  const rotaPlan = await byName(rota, "prepare_rota_import").execute({
    person: "Sam", candidates: [{
      sourceRowId: "row-1", date: "2026-09-01", start: "09:00", end: "17:00", confidence: 0.99,
    }],
  });
  const savedPattern = await byName(patterns, "commit_shift_pattern").execute({
    plan_id: patternPlan.planId, idempotency_key: "alex-pattern", confirmed: true,
  });
  assert.equal(savedPattern.ok, true);
  assert.equal(revision, 1);
  const staleRota = await byName(rota, "commit_rota_import").execute({
    plan_id: rotaPlan.planId, idempotency_key: "sam-rota", confirmed: true,
  });
  assert.equal(staleRota.code, "IMPORT_PLAN_STALE");
});

test("configured callbacks expose committed schedule data to a shared store", async () => {
  let patternState;
  let rotaState;
  const pattern = createShiftPatternWebMcpTools({
    householdMembers: ["Alex"], onStateChange: state => { patternState = state; },
  });
  const plan = await byName(pattern, "preview_shift_pattern").execute({
    person: "Alex", start_date: "2026-09-01", sequence: ["day"], definitions,
    repeat_mode: "cycles", cycles: 1,
  });
  await byName(pattern, "commit_shift_pattern").execute({
    plan_id: plan.planId, idempotency_key: "alex-one-day", confirmed: true,
  });
  assert.equal(patternState.patterns[0].person, "Alex");

  const rota = createRotaWebMcpTools({
    householdMembers: ["Alex"], onStateChange: state => { rotaState = state; },
  });
  const rotaPlan = await byName(rota, "prepare_rota_import").execute({
    person: "Alex", candidates: [{
      sourceRowId: "scan-1", date: "2026-09-02", start: "08:00", end: "16:00", confidence: 0.99,
    }],
  });
  await byName(rota, "commit_rota_import").execute({
    plan_id: rotaPlan.planId, idempotency_key: "alex-scan", confirmed: true,
  });
  assert.equal(rotaState.scheduleEvents[0].source, "rota_scan");
});
