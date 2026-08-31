import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

const tools = [
  "get_family_briefing",
  "get_family_schedule",
  "add_overtime",
  "detect_childcare_gap",
  "find_available_carers",
  "preview_coverage_relay",
  "commit_coverage_relay",
  "record_childcare_response",
  "get_village_status",
  "reset_village_demo",
];

test("registers the complete Village WebMCP tool surface", () => {
  for (const name of tools) {
    assert.match(source, new RegExp(`name: ["']${name}["']`));
  }
});

test("adds Rota Scan tools to the same serialized registration queue", () => {
  assert.match(source, /const rotaAdapter = createRotaWebMcpTools\(/);
  assert.match(source, /for \(const rotaTool of rotaAdapter\.tools\)/);
  assert.match(source, /void register\(rotaTool as Tool\)/);
});

test("adds Shift Pattern tools to the same serialized registration queue", () => {
  assert.match(source, /const patternAdapter = createShiftPatternWebMcpTools\(/);
  assert.match(source, /for \(const patternTool of patternAdapter\.tools\)/);
  assert.match(source, /void register\(patternTool as Tool\)/);
});

test("registers WebMCP tools sequentially so browser discovery cannot race", () => {
  assert.match(source, /let registrationQueue: Promise<void \| undefined> = Promise\.resolve\(\)/);
  assert.match(source, /registrationQueue = registrationQueue\.then/);
});

test("consequential tools enforce explicit confirmation", () => {
  assert.match(source, /add_overtime[\s\S]*?confirmed !== true/);
  assert.match(source, /commit_coverage_relay[\s\S]*?confirmed !== true/);
  assert.match(source, /reset_village_demo[\s\S]*?confirmed !== true/);
  assert.match(source, /CONFIRMATION_REQUIRED/g);
});

test("write tools expose idempotent outcomes", () => {
  assert.match(source, /event-overtime-1/);
  assert.match(source, /request-anne-1/);
  assert.match(source, /idempotent: true/g);
});

test("read tools are explicitly annotated", () => {
  const occurrences = source.match(/readOnlyHint: true/g) ?? [];
  assert.ok(occurrences.length >= 4);
});

test("demo contains no contact details", () => {
  assert.doesNotMatch(source, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(source, /(?:\+44|0)7\d{9}/);
});
