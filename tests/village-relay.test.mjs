import assert from "node:assert/strict";
import test from "node:test";

import { createInitialState, previewRelay, transition } from "../lib/village-engine.mjs";

const order = ["carer-anne", "carer-grandad", "carer-claire"];

function addOvertime(state) {
  return transition(state, { type: "ADD_OVERTIME" }).state;
}

function startRelay(state, idempotencyKey = "relay-key-1") {
  return transition(state, {
    type: "COMMIT_RELAY",
    orderedCarerIds: order,
    responseWindowMinutes: 15,
    idempotencyKey,
  });
}

test("previews a bounded, ordered Relay without changing state", () => {
  const state = addOvertime(createInitialState());
  const before = structuredClone(state);
  const preview = previewRelay(state, order, 15);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.steps.map(step => step.name), ["Anne", "Grandad", "Claire"]);
  assert.equal(preview.requires_confirmation, true);
  assert.deepEqual(state, before);
});

test("refuses to start a Relay before a real gap exists", () => {
  const outcome = startRelay(createInitialState());
  assert.equal(outcome.result.code, "NO_GAP");
  assert.equal(outcome.state.relay, null);
});

test("allows only one active request at a time", () => {
  const { state } = startRelay(addOvertime(createInitialState()));
  assert.equal(state.relay.steps.filter(step => step.status === "active").length, 1);
  assert.equal(state.relay.steps[0].name, "Anne");
  assert.deepEqual(state.relay.steps.slice(1).map(step => step.status), ["queued", "queued"]);
});

test("commit is duplicate-safe", () => {
  const first = startRelay(addOvertime(createInitialState()));
  const second = startRelay(first.state);
  assert.equal(second.result.idempotent, true);
  assert.equal(second.state, first.state);
  assert.equal(second.state.activity.filter(item => item.id === "relay-started").length, 1);
});

test("a decline advances exactly once and a duplicate response cannot skip a carer", () => {
  const started = startRelay(addOvertime(createInitialState()));
  const decline = {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "declined", responseId: "anne-response-1",
  };
  const first = transition(started.state, decline);
  assert.equal(first.state.relay.steps[0].status, "declined");
  assert.equal(first.state.relay.steps[1].status, "active");
  assert.equal(first.state.relay.steps[2].status, "queued");

  const duplicate = transition(first.state, decline);
  assert.equal(duplicate.result.idempotent, true);
  assert.equal(duplicate.state.relay.steps[1].status, "active");
  assert.equal(duplicate.state.relay.steps[2].status, "queued");
});

test("acceptance covers the gap and guarantees later carers are not contacted", () => {
  const started = startRelay(addOvertime(createInitialState()));
  const declined = transition(started.state, {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "declined", responseId: "anne-response-1",
  });
  const accepted = transition(declined.state, {
    type: "RECORD_RESPONSE", requestId: "request-grandad-1",
    response: "accepted", responseId: "grandad-response-1",
  });
  assert.equal(accepted.state.stage, "covered");
  assert.equal(accepted.state.coveredBy, "Grandad");
  assert.equal(accepted.state.relay.status, "covered");
  assert.equal(accepted.state.relay.steps[1].status, "accepted");
  assert.equal(accepted.state.relay.steps[2].status, "not_contacted");
  assert.deepEqual(accepted.result.stopped_before_contacting, ["Claire"]);
  assert.equal(accepted.state.relay.steps.filter(step => step.status === "active").length, 0);
});

test("an exhausted Relay returns to an uncovered state without widening consent", () => {
  let state = startRelay(addOvertime(createInitialState())).state;
  for (const [requestId, responseId] of [
    ["request-anne-1", "r1"],
    ["request-grandad-1", "r2"],
    ["request-claire-1", "r3"],
  ]) {
    state = transition(state, { type: "RECORD_RESPONSE", requestId, response: "declined", responseId }).state;
  }
  assert.equal(state.stage, "gap");
  assert.equal(state.relay.status, "exhausted");
  assert.equal(state.coveredBy, null);
});

test("a mismatched idempotency key on an active Relay fails loudly instead of silently reusing the old request", () => {
  const started = startRelay(addOvertime(createInitialState()), "key-A");
  const conflicting = transition(started.state, {
    type: "COMMIT_RELAY",
    orderedCarerIds: ["carer-claire", "carer-anne", "carer-grandad"],
    responseWindowMinutes: 30,
    idempotencyKey: "key-B-different",
  });
  assert.equal(conflicting.result.ok, false);
  assert.equal(conflicting.result.code, "RELAY_ALREADY_ACTIVE");
  assert.equal(conflicting.state, started.state);
  // the original approved order and window must be untouched
  assert.deepEqual(conflicting.state.relay.steps.map(step => step.name), ["Anne", "Grandad", "Claire"]);
});

test("a mismatched idempotency key on an already-resolved Relay is rejected, not silently accepted", () => {
  const started = startRelay(addOvertime(createInitialState()), "key-A");
  const covered = transition(started.state, {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "accepted", responseId: "anne-accept-1",
  });
  assert.equal(covered.state.relay.status, "covered");

  const retry = transition(covered.state, {
    type: "COMMIT_RELAY", orderedCarerIds: order,
    responseWindowMinutes: 15, idempotencyKey: "key-C-new",
  });
  assert.equal(retry.result.ok, false);
  assert.equal(retry.result.code, "RELAY_ALREADY_RESOLVED");
  assert.equal(retry.state, covered.state);
});

test("reusing a response_id for a different request is rejected instead of silently dropping the new response", () => {
  const started = startRelay(addOvertime(createInitialState()));
  const declined = transition(started.state, {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "declined", responseId: "evt-1",
  });
  assert.equal(declined.state.relay.steps[1].name, "Grandad");
  assert.equal(declined.state.relay.currentStepIndex, 1);

  // Grandad's real acceptance arrives, but the caller reused Anne's response_id ("evt-1").
  const collided = transition(declined.state, {
    type: "RECORD_RESPONSE", requestId: "request-grandad-1",
    response: "accepted", responseId: "evt-1",
  });
  assert.equal(collided.result.ok, false);
  assert.equal(collided.result.code, "RESPONSE_ID_CONFLICT");
  // the state must be untouched — Grandad's acceptance was neither applied nor lost silently
  assert.equal(collided.state, declined.state);
  assert.equal(collided.state.relay.status, "active");

  // the real acceptance still succeeds once given its own response_id
  const accepted = transition(declined.state, {
    type: "RECORD_RESPONSE", requestId: "request-grandad-1",
    response: "accepted", responseId: "evt-2",
  });
  assert.equal(accepted.result.ok, true);
  assert.equal(accepted.state.relay.status, "covered");
  assert.equal(accepted.state.coveredBy, "Grandad");
});

test("a reordered response for a queued (not yet active) carer is rejected", () => {
  const started = startRelay(addOvertime(createInitialState())).state;
  // Anne is active; Grandad has not been asked yet.
  const outOfOrder = transition(started, {
    type: "RECORD_RESPONSE", requestId: "request-grandad-1",
    response: "accepted", responseId: "grandad-jumps-queue",
  });
  assert.equal(outOfOrder.result.ok, false);
  assert.equal(outOfOrder.result.code, "REQUEST_NOT_ACTIVE");
  assert.equal(outOfOrder.state, started);
});

test("an unknown request_id is rejected rather than matched loosely", () => {
  const started = startRelay(addOvertime(createInitialState())).state;
  const bogus = transition(started, {
    type: "RECORD_RESPONSE", requestId: "request-does-not-exist",
    response: "accepted", responseId: "bogus-1",
  });
  assert.equal(bogus.result.ok, false);
  assert.equal(bogus.result.code, "REQUEST_NOT_ACTIVE");
});

test("a stale response for an already-resolved step cannot affect the relay after it has moved on", () => {
  const started = startRelay(addOvertime(createInitialState())).state;
  const declined = transition(started, {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "declined", responseId: "anne-response-1",
  }).state;
  // A late, out-of-band "actually Anne accepts" arrives after the relay already advanced to Grandad.
  const stale = transition(declined, {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "accepted", responseId: "anne-late-accept",
  });
  assert.equal(stale.result.ok, false);
  assert.equal(stale.result.code, "REQUEST_NOT_ACTIVE");
  assert.equal(stale.state, declined);
  assert.equal(stale.state.relay.steps[1].name, "Grandad");
  assert.equal(stale.state.relay.currentStepIndex, 1);
});

test("a response after the Relay is already covered is rejected, not reopened", () => {
  const started = startRelay(addOvertime(createInitialState())).state;
  const covered = transition(started, {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "accepted", responseId: "anne-accept-1",
  }).state;
  assert.equal(covered.relay.status, "covered");

  const lateClaire = transition(covered, {
    type: "RECORD_RESPONSE", requestId: "request-claire-1",
    response: "accepted", responseId: "claire-late-1",
  });
  assert.equal(lateClaire.result.ok, false);
  assert.equal(lateClaire.result.code, "RELAY_CLOSED");
  assert.equal(lateClaire.state, covered);
});

test("an untrusted or unknown carer id cannot be added to a Relay order", () => {
  const state = addOvertime(createInitialState());
  const preview = previewRelay(state, ["carer-anne", "carer-stranger"], 15);
  assert.equal(preview.ok, false);
  assert.equal(preview.code, "INELIGIBLE_CARER");
  assert.equal(preview.steps[1].reason, "Not trusted");

  const commit = transition(state, {
    type: "COMMIT_RELAY", orderedCarerIds: ["carer-anne", "carer-stranger"],
    responseWindowMinutes: 15, idempotencyKey: "key-untrusted",
  });
  assert.equal(commit.result.ok, false);
  assert.equal(commit.result.code, "INELIGIBLE_CARER");
  assert.equal(commit.state.relay, null);
});

test("sequential agent calls threaded through successive state snapshots never lose or reorder an update", () => {
  // Mirrors how the UI/agent bridge (app/page.tsx) threads state: each call reads the
  // previous call's output state, exactly like React's stateRef pattern, with no
  // call ever reading a stale snapshot.
  let state = createInitialState();
  ({ state } = transition(state, { type: "ADD_OVERTIME" }));
  ({ state } = transition(state, {
    type: "COMMIT_RELAY", orderedCarerIds: order,
    responseWindowMinutes: 15, idempotencyKey: "seq-1",
  }));
  ({ state } = transition(state, {
    type: "RECORD_RESPONSE", requestId: "request-anne-1",
    response: "declined", responseId: "seq-anne",
  }));
  ({ state } = transition(state, {
    type: "RECORD_RESPONSE", requestId: "request-grandad-1",
    response: "accepted", responseId: "seq-grandad",
  }));
  assert.equal(state.stage, "covered");
  assert.equal(state.coveredBy, "Grandad");
  assert.equal(state.relay.steps[2].status, "not_contacted");
});
