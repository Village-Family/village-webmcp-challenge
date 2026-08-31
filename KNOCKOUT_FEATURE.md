# Knockout Feature — Village Relay

## Product promise

**One approval. One respectful chain of requests. Childcare covered.**

Village Relay turns an uncovered childcare gap into a safe, visible escalation plan across the family’s trusted circle. The parent approves the plan once. Village contacts one suitable person at a time, stops immediately when somebody accepts, updates the shared plan, and records every consequential action.

It solves the real failure in family coordination: not finding a name, but managing the repeated asking, waiting, following up, and keeping everyone aligned.

## Golden demo command

> I’ve been called in on Tuesday from 4pm to 10pm. Sort the childcare without messaging everyone at once. Try Anne first, then Grandad, then Claire. Wait 15 minutes between requests and confirm the whole plan with me before contacting anyone.

## Judge-visible flow

1. The agent reads the live family plan and detects the childcare gap.
2. It checks the trusted village and each person’s declared availability.
3. It presents a Relay preview:

   - Anne — available, first choice
   - Grandad — available, backup
   - Claire — maybe available, final backup
   - 15-minute response window
   - only one active request at a time

4. The parent approves the complete Relay once.
5. The interface changes from **Uncovered** to **Relay active**.
6. Anne receives the first request.
7. For the deterministic demo, Anne declines.
8. Village automatically advances to Grandad without asking the parent to repeat the task.
9. Grandad accepts.
10. Village immediately:

    - marks the childcare gap **Covered by Grandad**;
    - stops the relay;
    - prevents Claire from being contacted;
    - adds the care block to the visible calendar;
    - records the request, decline, escalation, acceptance, and final coverage.

## The knockout visual

The calendar gap becomes a compact live Relay card:

- **Red — Uncovered**
- **Amber — Relay active**
- **Green — Covered**

Under it, show a vertical chain of trusted-person avatars:

- Anne — Declined
- Grandad — Accepted
- Claire — Not contacted

The final “Not contacted” state matters. It proves the agent respected the approved boundary and stopped when the outcome was achieved.

## Safety and consent model

### Confirmation is required before

- starting a Relay;
- changing the ranked contact order;
- widening the Relay beyond trusted carers;
- changing the underlying work or childcare calendar.

### Confirmation is not repeated when

- advancing to the next person inside an already approved Relay;
- recording a decline;
- stopping after an acceptance;
- synchronising the resulting covered state.

This is bounded autonomy: the family approves the policy and limits; the agent executes inside them.

## WebMCP design

Prefer extending the existing deterministic state engine rather than adding a parallel state store.

### New tool: `preview_coverage_relay`

Read-only. Returns a deterministic preview and validation result.

Input:

```json
{
  "gapId": "gap-tue-evening",
  "orderedCarerIds": ["carer-anne", "carer-grandad", "carer-claire"],
  "responseWindowMinutes": 15
}
```

Return:

- relay plan ID;
- validated eligible carers in order;
- exclusions and reasons;
- response window;
- actions requiring confirmation;
- plain-language summary.

### New tool: `commit_coverage_relay`

Consequential write requiring confirmation.

Input:

```json
{
  "relayPlanId": "relay-plan-...",
  "idempotencyKey": "..."
}
```

Return:

- relay ID;
- first active request;
- next deadline;
- public activity event;
- current coverage status.

### Extend existing response tool

When `record_carer_response` receives:

- **decline:** close the request and activate the next eligible request;
- **accept:** close the Relay as covered, cancel all future steps, create/update the care block, and record the final activity;
- **no response:** advance only after the approved response window.

For the competition demo, expose a clearly labelled demo response control. Do not depend on a real 15-minute timer or external messaging provider.

## State model

```ts
type RelayStatus = "preview" | "active" | "covered" | "exhausted" | "cancelled";
type RelayStepStatus =
  | "queued"
  | "active"
  | "accepted"
  | "declined"
  | "timed_out"
  | "not_contacted";

type CoverageRelay = {
  id: string;
  gapId: string;
  status: RelayStatus;
  responseWindowMinutes: number;
  currentStepIndex: number | null;
  steps: Array<{
    carerId: string;
    status: RelayStepStatus;
    requestId?: string;
  }>;
  createdAt: string;
  completedAt?: string;
  idempotencyKey: string;
};
```

## Invariants

1. At most one Relay step is active.
2. An acceptance immediately prevents any later person from being contacted.
3. A carer cannot appear twice in one Relay.
4. Only eligible trusted carers can be queued.
5. Repeating `commit_coverage_relay` with the same idempotency key returns the existing Relay.
6. Repeating a response event cannot advance twice.
7. A covered or cancelled Relay cannot be restarted.
8. UI and WebMCP tools always read the same state.

## Essential tests

- preview rejects an uncovered or unknown gap ID;
- preview excludes unavailable/untrusted carers with reasons;
- commit requires confirmation;
- duplicate commit is idempotent;
- decline advances exactly once;
- duplicate decline does not skip a person;
- acceptance stops the chain;
- no later request exists after acceptance;
- exhausted Relay returns to uncovered with a clear status;
- UI shows red → amber → green from the shared state;
- direct sequential tool-call test covers the complete Anne-declines / Grandad-accepts story.

## Scope discipline

### Must ship

- Relay preview;
- one-time confirmation;
- sequential in-app requests;
- deterministic decline/accept demo;
- visible status chain;
- idempotent state transitions;
- activity history;
- direct tool-call tests.

### Do not build before submission

- SMS, WhatsApp, or push-provider integration;
- real timers or background jobs;
- live geolocation;
- carer payments;
- AI-generated ranking;
- production authentication changes.

Those can follow. The challenge version should prove the interaction model flawlessly.

## Why this can win

Village Relay demonstrates something difficult to show with ordinary form automation:

- the agent interprets an outcome;
- reads shared live state;
- proposes a bounded multi-step policy;
- obtains meaningful human consent;
- executes across multiple future state changes;
- reacts to another person’s response;
- stops at exactly the approved boundary;
- leaves a coherent, auditable result in the interface.

Most agent demos show a tool call. Village Relay shows trustworthy delegation.
