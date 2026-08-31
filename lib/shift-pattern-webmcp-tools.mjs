import {
  commitEditShiftPattern, commitPatternException, commitShiftPattern, commitStopShiftPattern, createPatternState,
  materializePattern, previewEditShiftPattern, previewPatternException, previewShiftPattern, previewStopShiftPattern,
} from "./shift-pattern-engine.mjs";

function schema(properties, required = []) {
  return { type: "object", additionalProperties: false, properties, required };
}

const definitionSchema = {
  type: "object", additionalProperties: false,
  properties: {
    code: { type: "string", minLength: 1, maxLength: 20 },
    label: { type: "string", minLength: 1, maxLength: 60 },
    start: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    end: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  },
  required: ["code", "label", "start", "end"],
};

export function createShiftPatternWebMcpTools({
  householdMembers = ["John", "Tash"], initialPatterns = [],
  getHouseholdRevision, onStateChange = () => {},
} = {}) {
  let state = createPatternState(initialPatterns);
  const currentRevision = () => getHouseholdRevision?.() ?? state.revision;
  const plans = new Map();
  const rememberPlan = preview => {
    if (!preview.ok) return;
    plans.set(preview.planId, preview);
    while (plans.size > 50) plans.delete(plans.keys().next().value);
  };
  const tools = [
    {
      name: "preview_shift_pattern", title: "Preview repeating shift pattern",
      description: "Create a read-only preview of a repeating rota such as Early, Early, Late, Late, Night, Night, Off, Off, Off, Off. Supports a cycle count, an end date, or continuing until stopped. Never changes the calendar.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({
        person: { type: "string", minLength: 1, maxLength: 80, description: "Exact name of an existing household member." },
        start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        sequence: { type: "array", minItems: 1, maxItems: 84, items: { type: "string", maxLength: 20 } },
        definitions: { type: "array", minItems: 1, maxItems: 8, items: definitionSchema },
        repeat_mode: { type: "string", enum: ["cycles", "until", "indefinite"] },
        cycles: { type: "integer", minimum: 1, maximum: 520 },
        until_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      }, ["person", "start_date", "sequence", "definitions", "repeat_mode"]),
      execute: async ({ person, start_date, sequence, definitions, repeat_mode, cycles, until_date }) => {
        const preview = previewShiftPattern({
          person, startDate: start_date, sequence, definitions,
          repeat: { mode: repeat_mode, cycles, untilDate: until_date },
          householdRevision: currentRevision(), existingPatterns: state.patterns, householdMembers,
        });
        rememberPlan(preview);
        return preview;
      },
    },
    {
      name: "commit_shift_pattern", title: "Save repeating shift pattern",
      description: "Save one exact reviewed pattern as a compact recurring rule. Call with confirmed=false to show the consent boundary and true only after explicit approval.",
      inputSchema: schema({
        plan_id: { type: "string", pattern: "^pattern-plan-[a-f0-9]{8}$" },
        idempotency_key: { type: "string", minLength: 4, maxLength: 100 },
        confirmed: { type: "boolean" },
      }, ["plan_id", "idempotency_key", "confirmed"]),
      execute: async ({ plan_id, idempotency_key, confirmed }) => {
        const preview = plans.get(plan_id);
        if (!preview) return { ok: false, code: "PATTERN_PLAN_NOT_FOUND", plan_id };
        if (preview.baseRevision !== currentRevision()) {
          return { ok: false, code: "PATTERN_PLAN_STALE", current_revision: currentRevision() };
        }
        const outcome = commitShiftPattern({ ...state, revision: preview.baseRevision }, preview, {
          confirmed, idempotencyKey: idempotency_key,
        });
        if (outcome.result.ok && outcome.state.revision !== state.revision) {
          state = outcome.state;
          onStateChange(state, outcome.result);
        }
        return outcome.result;
      },
    },
    {
      name: "get_shift_patterns", title: "Get shift patterns",
      description: "Read active repeating shift rules. Never changes data.",
      annotations: { readOnlyHint: true }, inputSchema: schema({}),
      execute: async () => ({ ok: true, household_revision: state.revision, patterns: state.patterns }),
    },
    {
      name: "get_pattern_shifts", title: "Get generated pattern shifts",
      description: "Generate the visible shifts for one saved pattern and a date range of up to 366 days. Never copies or changes calendar data.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({
        pattern_id: { type: "string", pattern: "^pattern-[a-f0-9]{8}$" },
        from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      }, ["pattern_id", "from", "to"]),
      execute: async ({ pattern_id, from, to }) => {
        const pattern = state.patterns.find(item => item.id === pattern_id);
        if (!pattern) return { ok: false, code: "SHIFT_PATTERN_NOT_FOUND", pattern_id };
        return materializePattern(pattern, { from, to });
      },
    },
    {
      name: "preview_pattern_exception", title: "Preview one rota exception",
      description: "Preview changing one occurrence in a repeating rota to another shift or a rest day. The underlying series is not changed.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({
        pattern_id: { type: "string", pattern: "^pattern-[a-f0-9]{8}$" },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        code: { type: "string", minLength: 1, maxLength: 20, description: "A saved shift code, off, or a new custom code with definition." },
        definition: definitionSchema,
      }, ["pattern_id", "date", "code"]),
      execute: async ({ pattern_id, date, code, definition }) => {
        const preview = previewPatternException({
          pattern: state.patterns.find(item => item.id === pattern_id), date, code, definition,
          householdRevision: currentRevision(),
        });
        rememberPlan(preview);
        return preview;
      },
    },
    {
      name: "commit_pattern_exception", title: "Save one rota exception",
      description: "Save one exact reviewed occurrence change. Requires explicit confirmation and never rewrites the remaining series.",
      inputSchema: schema({
        plan_id: { type: "string", pattern: "^pattern-exception-[a-f0-9]{8}$" },
        idempotency_key: { type: "string", minLength: 4, maxLength: 100 },
        confirmed: { type: "boolean" },
      }, ["plan_id", "idempotency_key", "confirmed"]),
      execute: async ({ plan_id, idempotency_key, confirmed }) => {
        const preview = plans.get(plan_id);
        if (!preview) return { ok: false, code: "PATTERN_EXCEPTION_PLAN_NOT_FOUND", plan_id };
        if (preview.baseRevision !== currentRevision()) return { ok: false, code: "PATTERN_PLAN_STALE", current_revision: currentRevision() };
        const outcome = commitPatternException({ ...state, revision: preview.baseRevision }, preview, { confirmed, idempotencyKey: idempotency_key });
        if (outcome.result.ok && outcome.state.revision !== state.revision) {
          state = outcome.state; onStateChange(state, outcome.result);
        }
        return outcome.result;
      },
    },
    {
      name: "preview_stop_shift_pattern", title: "Preview stopping a shift pattern",
      description: "Preview stopping a repeating rota from a chosen date while preserving earlier shifts.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({
        pattern_id: { type: "string", pattern: "^pattern-[a-f0-9]{8}$" },
        effective_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      }, ["pattern_id", "effective_date"]),
      execute: async ({ pattern_id, effective_date }) => {
        const preview = previewStopShiftPattern({
          pattern: state.patterns.find(item => item.id === pattern_id),
          effectiveDate: effective_date, householdRevision: currentRevision(),
        });
        rememberPlan(preview);
        return preview;
      },
    },
    {
      name: "commit_stop_shift_pattern", title: "Stop a shift pattern",
      description: "Stop one exact reviewed repeating rota from a chosen date. Requires explicit confirmation.",
      inputSchema: schema({
        plan_id: { type: "string", pattern: "^pattern-stop-[a-f0-9]{8}$" },
        idempotency_key: { type: "string", minLength: 4, maxLength: 100 },
        confirmed: { type: "boolean" },
      }, ["plan_id", "idempotency_key", "confirmed"]),
      execute: async ({ plan_id, idempotency_key, confirmed }) => {
        const preview = plans.get(plan_id);
        if (!preview) return { ok: false, code: "PATTERN_STOP_PLAN_NOT_FOUND", plan_id };
        if (preview.baseRevision !== currentRevision()) return { ok: false, code: "PATTERN_PLAN_STALE", current_revision: currentRevision() };
        const outcome = commitStopShiftPattern({ ...state, revision: preview.baseRevision }, preview, { confirmed, idempotencyKey: idempotency_key });
        if (outcome.result.ok && outcome.state.revision !== state.revision) {
          state = outcome.state; onStateChange(state, outcome.result);
        }
        return outcome.result;
      },
    },
    {
      name: "preview_pattern_edit", title: "Preview editing a shift pattern",
      description: "Preview a reviewed replacement for one repeating rota. Choose this_and_future to preserve history, or entire_series to replace the rule from its original start. Never changes the calendar.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({
        pattern_id: { type: "string", pattern: "^pattern-[a-f0-9]{8}$" },
        scope: { type: "string", enum: ["this_and_future", "entire_series"] },
        effective_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Required for this_and_future; ignored for entire_series." },
        sequence: { type: "array", minItems: 1, maxItems: 84, items: { type: "string", maxLength: 20 } },
        definitions: { type: "array", minItems: 1, maxItems: 8, items: definitionSchema },
        repeat_mode: { type: "string", enum: ["cycles", "until", "indefinite"] },
        cycles: { type: "integer", minimum: 1, maximum: 520 },
        until_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      }, ["pattern_id", "scope", "sequence", "definitions", "repeat_mode"]),
      execute: async ({ pattern_id, scope, effective_date, sequence, definitions, repeat_mode, cycles, until_date }) => {
        const preview = previewEditShiftPattern({
          pattern: state.patterns.find(item => item.id === pattern_id), scope,
          effectiveDate: effective_date, sequence, definitions,
          repeat: { mode: repeat_mode, cycles, untilDate: until_date },
          householdRevision: currentRevision(), existingPatterns: state.patterns, householdMembers,
        });
        rememberPlan(preview);
        return preview;
      },
    },
    {
      name: "commit_pattern_edit", title: "Save a shift pattern edit",
      description: "Save one exact reviewed pattern edit. Requires explicit confirmation and preserves earlier shifts when scope is this_and_future.",
      inputSchema: schema({
        plan_id: { type: "string", pattern: "^pattern-edit-[a-f0-9]{8}$" },
        idempotency_key: { type: "string", minLength: 4, maxLength: 100 },
        confirmed: { type: "boolean" },
      }, ["plan_id", "idempotency_key", "confirmed"]),
      execute: async ({ plan_id, idempotency_key, confirmed }) => {
        const preview = plans.get(plan_id);
        if (!preview) return { ok: false, code: "PATTERN_EDIT_PLAN_NOT_FOUND", plan_id };
        if (preview.baseRevision !== currentRevision()) return { ok: false, code: "PATTERN_PLAN_STALE", current_revision: currentRevision() };
        const outcome = commitEditShiftPattern({ ...state, revision: preview.baseRevision }, preview, { confirmed, idempotencyKey: idempotency_key });
        if (outcome.result.ok && outcome.state.revision !== state.revision) {
          state = outcome.state; onStateChange(state, outcome.result);
        }
        return outcome.result;
      },
    },
  ];
  return { tools, getState: () => state };
}
