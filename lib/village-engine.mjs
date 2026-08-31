export const RELAY_PLAN_ID = "relay-plan-tue-1";
export const RELAY_ID = "relay-tue-1";

export const carers = [
  { id: "carer-anne", name: "Anne", relationship: "Grandparent", available: true },
  { id: "carer-grandad", name: "Grandad", relationship: "Grandparent", available: true },
  { id: "carer-claire", name: "Claire", relationship: "Auntie", available: true },
];

const initialActivity = [{
  id: "initial", actor: "Tash", text: "Late shift added for Tuesday",
  time: "Earlier", tone: "human",
}];

export function createInitialState() {
  return {
    stage: "clear",
    overtimeAdded: false,
    relay: null,
    coveredBy: null,
    activity: initialActivity.map(item => ({ ...item })),
    processedResponseIds: [],
  };
}

function event(id, actor, text, tone) {
  return { id, actor, text, tone, time: "Just now" };
}

function withActivity(state, item) {
  return { ...state, activity: [item, ...state.activity] };
}

export function previewRelay(state, orderedCarerIds, responseWindowMinutes = 15) {
  if (!state.overtimeAdded) {
    return { ok: false, code: "NO_GAP", message: "Add overtime before creating a Relay." };
  }
  const unique = [...new Set(orderedCarerIds)];
  if (unique.length !== orderedCarerIds.length) {
    return { ok: false, code: "DUPLICATE_CARER", message: "A carer can appear only once." };
  }
  const steps = unique.map(carerId => {
    const carer = carers.find(item => item.id === carerId);
    return carer && carer.available
      ? { carer_id: carer.id, name: carer.name, eligible: true }
      : { carer_id: carerId, name: carer?.name ?? "Unknown", eligible: false, reason: carer ? "Unavailable" : "Not trusted" };
  });
  if (steps.some(step => !step.eligible)) {
    return { ok: false, code: "INELIGIBLE_CARER", steps };
  }
  return {
    ok: true,
    relay_plan_id: RELAY_PLAN_ID,
    gap_id: "gap-tue-1",
    response_window_minutes: responseWindowMinutes,
    steps,
    summary: `Ask ${steps.map(step => step.name).join(", then ")}; one active request at a time.`,
    requires_confirmation: true,
  };
}

export function transition(state, action) {
  switch (action.type) {
    case "ADD_OVERTIME": {
      if (state.overtimeAdded) {
        return { state, result: { ok: true, idempotent: true, event_id: "event-overtime-1" } };
      }
      let next = { ...state, stage: "gap", overtimeAdded: true };
      next = withActivity(next, event("gap", "Village agent", "Childcare gap found for Ida and Arlo", "agent"));
      next = withActivity(next, event("overtime", "John", "Overtime added · Tue 1 Sep, 16:00–22:00", "human"));
      return { state: next, result: { ok: true, event_id: "event-overtime-1", next_step: "Preview a coverage Relay." } };
    }

    case "COMMIT_RELAY": {
      if (state.relay) {
        if (state.relay.idempotencyKey === action.idempotencyKey) {
          return { state, result: { ok: true, idempotent: true, relay_id: state.relay.id, status: state.relay.status } };
        }
        // A relay already exists under a different idempotency key: never silently
        // reuse or overwrite it. Fail loudly so a mismatched retry can't be mistaken
        // for success, and so an already-resolved relay can't be re-triggered without
        // an explicit reset.
        return {
          state,
          result: {
            ok: false,
            code: state.relay.status === "active" ? "RELAY_ALREADY_ACTIVE" : "RELAY_ALREADY_RESOLVED",
            relay_id: state.relay.id,
            status: state.relay.status,
            message: state.relay.status === "active"
              ? "A different Relay request is already active. Wait for it to resolve before starting another."
              : "This Relay has already finished. Reset the demo before starting a new one.",
          },
        };
      }
      const preview = previewRelay(state, action.orderedCarerIds, action.responseWindowMinutes);
      if (!preview.ok) return { state, result: preview };
      const relay = {
        id: RELAY_ID,
        planId: RELAY_PLAN_ID,
        status: "active",
        responseWindowMinutes: action.responseWindowMinutes,
        currentStepIndex: 0,
        idempotencyKey: action.idempotencyKey,
        steps: preview.steps.map((step, index) => ({
          carerId: step.carer_id,
          name: step.name,
          status: index === 0 ? "active" : "queued",
          requestId: `request-${step.carer_id.replace("carer-", "")}-1`,
        })),
      };
      const next = withActivity(
        { ...state, stage: "relay", relay },
        event("relay-started", "Village agent", `Relay approved · ${relay.steps[0].name} asked first`, "agent"),
      );
      return {
        state: next,
        result: {
          ok: true, relay_id: relay.id, status: "active",
          active_request: { request_id: relay.steps[0].requestId, carer: relay.steps[0].name },
          next_deadline_minutes: relay.responseWindowMinutes,
        },
      };
    }

    case "RECORD_RESPONSE": {
      if (!state.relay) return { state, result: { ok: false, code: "RELAY_NOT_FOUND" } };
      const priorResponse = state.processedResponseIds.find(entry => entry.id === action.responseId);
      if (priorResponse) {
        // Same response_id replayed for the exact same request+outcome: a safe,
        // idempotent no-op. Same response_id reused for a *different* request or
        // outcome is an ID collision, not a duplicate — surface it as a conflict
        // instead of silently discarding what could be a genuine new response.
        if (priorResponse.requestId === action.requestId && priorResponse.response === action.response) {
          return { state, result: { ok: true, idempotent: true, status: state.relay.status } };
        }
        return {
          state,
          result: {
            ok: false,
            code: "RESPONSE_ID_CONFLICT",
            message: "This response_id was already recorded for a different request or response.",
          },
        };
      }
      if (state.relay.status !== "active") {
        return { state, result: { ok: false, code: "RELAY_CLOSED", status: state.relay.status } };
      }
      const index = state.relay.currentStepIndex;
      const active = state.relay.steps[index];
      if (!active || active.requestId !== action.requestId || active.status !== "active") {
        return { state, result: { ok: false, code: "REQUEST_NOT_ACTIVE" } };
      }

      const processedResponseIds = [
        ...state.processedResponseIds,
        { id: action.responseId, requestId: action.requestId, response: action.response },
      ];
      if (action.response === "accepted") {
        const steps = state.relay.steps.map((step, stepIndex) => ({
          ...step,
          status: stepIndex === index ? "accepted" : stepIndex > index ? "not_contacted" : step.status,
        }));
        const relay = { ...state.relay, status: "covered", currentStepIndex: null, steps };
        const next = withActivity(
          { ...state, stage: "covered", relay, coveredBy: active.name, processedResponseIds },
          event(`accepted-${active.carerId}`, active.name, "Accepted childcare · Relay stopped and calendar updated", "carer"),
        );
        return {
          state: next,
          result: {
            ok: true, status: "covered", covered_by: active.name,
            calendar_event_id: `care-${active.carerId.replace("carer-", "")}-1`,
            stopped_before_contacting: steps.filter(step => step.status === "not_contacted").map(step => step.name),
          },
        };
      }

      const nextIndex = index + 1;
      const steps = state.relay.steps.map((step, stepIndex) => ({
        ...step,
        status: stepIndex === index ? (action.response === "timed_out" ? "timed_out" : "declined")
          : stepIndex === nextIndex ? "active" : step.status,
      }));

      if (nextIndex >= steps.length) {
        const relay = { ...state.relay, status: "exhausted", currentStepIndex: null, steps };
        const next = withActivity(
          { ...state, stage: "gap", relay, processedResponseIds },
          event("relay-exhausted", "Village agent", "Relay exhausted · childcare still needed", "agent"),
        );
        return { state: next, result: { ok: true, status: "exhausted", next_step: "Ask John before widening the trusted circle." } };
      }

      const relay = { ...state.relay, currentStepIndex: nextIndex, steps };
      let next = withActivity(
        { ...state, stage: "relay", relay, processedResponseIds },
        event(`response-${active.carerId}`, active.name, action.response === "timed_out" ? "No response in approved window" : "Declined childcare request", "carer"),
      );
      next = withActivity(next, event(`advance-${steps[nextIndex].carerId}`, "Village agent", `Relay advanced · ${steps[nextIndex].name} asked next`, "agent"));
      return {
        state: next,
        result: {
          ok: true, status: "active", previous_response: action.response,
          active_request: { request_id: steps[nextIndex].requestId, carer: steps[nextIndex].name },
        },
      };
    }

    case "RESET":
      return { state: createInitialState(), result: { ok: true, status: "reset" } };

    default:
      return { state, result: { ok: false, code: "UNKNOWN_ACTION" } };
  }
}
