import { buildRotaPreview, commitRotaPreview, createRotaState } from "./rota-import-engine.mjs";

function schema(properties, required = []) {
  return { type: "object", additionalProperties: false, properties, required };
}

const candidateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceRowId: { type: "string", minLength: 1, maxLength: 64 },
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    start: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    end: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    label: { type: "string", minLength: 1, maxLength: 80 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sourceText: { type: "string", maxLength: 240 },
    ambiguityFlags: {
      type: "array", maxItems: 8, uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 48 },
    },
  },
  required: ["sourceRowId", "date", "start", "end", "confidence"],
};

export function createRotaWebMcpTools({
  initialEvents = [], householdMembers = ["John", "Tash"],
  getHouseholdRevision, onStateChange = () => {},
} = {}) {
  let state = createRotaState(initialEvents);
  const currentRevision = () => getHouseholdRevision?.() ?? state.revision;
  const plans = new Map();
  const rememberPlan = preview => {
    if (!preview.ok) return;
    plans.set(preview.planId, preview);
    while (plans.size > 50) plans.delete(plans.keys().next().value);
  };

  const tools = [
    {
      name: "prepare_rota_import",
      title: "Prepare rota import",
      description: "Validate shifts extracted from a rota image and produce a reviewable, confirmation-bound import plan. This does not change the family calendar. Re-run with corrected rows when any row needs review.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({
        person: { type: "string", minLength: 1, maxLength: 80, description: "Exact name of an existing household member." },
        candidates: { type: "array", minItems: 1, maxItems: 31, items: candidateSchema },
      }, ["person", "candidates"]),
      execute: async ({ person, candidates }) => {
        const preview = buildRotaPreview({
          person,
          candidates,
          existingEvents: state.scheduleEvents,
          householdRevision: currentRevision(),
          householdMembers,
        });
        rememberPlan(preview);
        return preview;
      },
    },
    {
      name: "get_rota_import_plan",
      title: "Get rota import plan",
      description: "Read an existing rota import preview by plan ID. Never changes the family calendar.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({ plan_id: { type: "string", pattern: "^rota-plan-[a-f0-9]{8}$" } }, ["plan_id"]),
      execute: async ({ plan_id }) => plans.get(plan_id) ?? {
        ok: false, code: "IMPORT_PLAN_NOT_FOUND", plan_id,
      },
    },
    {
      name: "commit_rota_import",
      title: "Commit reviewed rota import",
      description: "Atomically add every ready shift from one exact reviewed plan. Call with confirmed=false first to show the human consent boundary, and confirmed=true only after explicit approval. Stale, ambiguous and invalid plans are rejected.",
      inputSchema: schema({
        plan_id: { type: "string", pattern: "^rota-plan-[a-f0-9]{8}$" },
        idempotency_key: { type: "string", minLength: 4, maxLength: 100 },
        confirmed: { type: "boolean", description: "True only after the person explicitly approves this exact plan." },
      }, ["plan_id", "idempotency_key", "confirmed"]),
      execute: async ({ plan_id, idempotency_key, confirmed }) => {
        const preview = plans.get(plan_id);
        if (!preview) return { ok: false, code: "IMPORT_PLAN_NOT_FOUND", plan_id };
        if (preview.baseRevision !== currentRevision()) {
          return { ok: false, code: "IMPORT_PLAN_STALE", current_revision: currentRevision() };
        }
        const outcome = commitRotaPreview({ ...state, revision: preview.baseRevision }, preview, {
          confirmed,
          idempotencyKey: idempotency_key,
        });
        if (outcome.result.ok && outcome.state.revision !== state.revision) {
          state = outcome.state;
          onStateChange(state, outcome.result);
        }
        return outcome.result;
      },
    },
    {
      name: "get_imported_shifts",
      title: "Get imported shifts",
      description: "Read rota-scan shifts currently committed to the family calendar, including their import provenance. Never changes data.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({}),
      execute: async () => ({
        ok: true,
        household_revision: state.revision,
        shifts: state.scheduleEvents.filter(event => event.source === "rota_scan"),
        imports: state.committedImports,
      }),
    },
  ];

  return { tools, getState: () => state };
}
