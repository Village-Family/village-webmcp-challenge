import assert from "node:assert/strict";
import test from "node:test";

import { createRotaWebMcpTools } from "../lib/rota-webmcp-tools.mjs";

const candidates = [
  { sourceRowId: "mon", date: "2026-08-31", start: "07:00", end: "15:00", confidence: 0.98, sourceText: "MON 0700-1500" },
  { sourceRowId: "tue", date: "2026-09-01", start: "14:00", end: "22:00", confidence: 0.97, sourceText: "TUE 1400-2200" },
];

function byName(tools, name) {
  const tool = tools.find(item => item.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool;
}

test("exposes a bounded four-tool rota workflow with unique names", () => {
  const { tools } = createRotaWebMcpTools();
  assert.deepEqual(tools.map(tool => tool.name), [
    "prepare_rota_import",
    "get_rota_import_plan",
    "commit_rota_import",
    "get_imported_shifts",
  ]);
  assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length);
});

test("prepares, previews, confirms and reads an atomic import", async () => {
  const stateChanges = [];
  const { tools } = createRotaWebMcpTools({ onStateChange: state => stateChanges.push(state.revision) });
  const prepare = byName(tools, "prepare_rota_import");
  const getPlan = byName(tools, "get_rota_import_plan");
  const commit = byName(tools, "commit_rota_import");
  const getShifts = byName(tools, "get_imported_shifts");

  const plan = await prepare.execute({ person: "John", candidates });
  assert.equal(plan.canCommit, true);
  assert.deepEqual(await getPlan.execute({ plan_id: plan.planId }), plan);

  const consent = await commit.execute({
    plan_id: plan.planId, idempotency_key: "rota-demo-1", confirmed: false,
  });
  assert.equal(consent.code, "CONFIRMATION_REQUIRED");
  assert.deepEqual(stateChanges, []);

  const result = await commit.execute({
    plan_id: plan.planId, idempotency_key: "rota-demo-1", confirmed: true,
  });
  assert.equal(result.imported, 2);
  assert.deepEqual(stateChanges, [1]);

  const status = await getShifts.execute({});
  assert.equal(status.household_revision, 1);
  assert.equal(status.shifts.length, 2);
  assert.ok(status.shifts.every(shift => shift.sourcePlanId === plan.planId));
});

test("blocks ambiguous extraction and rejects unknown plans", async () => {
  const { tools } = createRotaWebMcpTools();
  const prepare = byName(tools, "prepare_rota_import");
  const commit = byName(tools, "commit_rota_import");
  const plan = await prepare.execute({
    person: "Tash",
    candidates: [{ ...candidates[0], confidence: 0.55, ambiguityFlags: ["DATE_UNCLEAR"] }],
  });
  assert.equal(plan.canCommit, false);
  const blocked = await commit.execute({
    plan_id: plan.planId, idempotency_key: "rota-demo-2", confirmed: true,
  });
  assert.equal(blocked.code, "IMPORT_REVIEW_REQUIRED");
  const missing = await commit.execute({
    plan_id: "rota-plan-deadbeef", idempotency_key: "rota-demo-3", confirmed: true,
  });
  assert.equal(missing.code, "IMPORT_PLAN_NOT_FOUND");
});

test("rejects a stale plan after another import changes the household", async () => {
  const { tools } = createRotaWebMcpTools();
  const prepare = byName(tools, "prepare_rota_import");
  const commit = byName(tools, "commit_rota_import");
  const first = await prepare.execute({ person: "John", candidates: [candidates[0]] });
  const stale = await prepare.execute({ person: "Tash", candidates: [candidates[1]] });
  await commit.execute({ plan_id: first.planId, idempotency_key: "first-plan", confirmed: true });
  const result = await commit.execute({ plan_id: stale.planId, idempotency_key: "stale-plan", confirmed: true });
  assert.equal(result.code, "IMPORT_PLAN_STALE");
});
