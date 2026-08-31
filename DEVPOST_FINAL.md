# Village — Final Submission Copy

## Tagline

**Family coordination that agents can help with—and families stay in control of.**

## Short description

Village is a shared family coordination surface built for WebMCP. An agent can read the live family plan, detect childcare gaps, find a trusted carer, and prepare the next action. Consequential changes—editing the calendar or contacting someone—require explicit confirmation and are recorded in a shared activity history.

## Inspiration

Shift-working families do not have a simple scheduling problem. One change at work can affect school pickup, childcare, a partner’s shift, and another person’s availability. Today that coordination is spread across calendars, memory, group chats, and hurried phone calls.

We built Village around a harder and more useful question: what would it take for an agent to help coordinate a family without taking authority away from the people involved?

## What it does

Village turns rota screenshots and irregular repeating shifts into the same live plan used for childcare. It supports cycles from one to 84 days, reviewed imports, one-off exceptions, stopping a pattern, and “this and future” edits that preserve history.

Village gives a family one live surface for:

- work, school, and childcare commitments;
- trusted carers and their availability;
- uncovered care gaps;
- requests and responses;
- a readable history of consequential changes.

Through WebMCP, an agent can inspect that same state and carry out a multi-step coordination task from a natural-language request. For example, a parent can say they accepted overtime and ask the agent to update the plan, check childcare, and prepare a request to a trusted carer.

Village pauses before the two moments that matter most: changing the family calendar and contacting another person.

## Why WebMCP is essential

This is not a chatbot with copied calendar text. The agent discovers imperative tools exposed by the website and acts on the same state the family can see and edit.

Village uses WebMCP to let an agent:

1. read the current family plan;
2. inspect trusted carers and availability;
3. detect uncovered childcare gaps;
4. preview a proposed calendar change;
5. commit an approved change;
6. find an eligible trusted carer;
7. preview and send an approved request;
8. record the carer’s response.

Without WebMCP, the agent would need fragile DOM automation, a separate integration, or a stale copy of the schedule. With WebMCP, the website itself defines the safe actions, their inputs, and the confirmation boundary.

## Human–agent collaboration

Village deliberately separates assistance from authority.

The agent is good at:

- reading across the shared plan;
- spotting conflicts and missing coverage;
- narrowing suitable carers;
- preparing the next step;
- explaining what changed.

The family retains control over:

- calendar commitments;
- communication with another person;
- acceptance of a care arrangement;
- the final shared plan.

That division is the product, not an afterthought.

## Technical execution

The app exposes a focused suite of imperative WebMCP tools across the family schedule, Rota Scan, Shift Patterns, and Village Relay. Consequential writes are confirmation-gated. Stable identifiers, shared household revisions, and idempotency keys prevent stale approvals, duplicate shifts, or duplicate requests. Every material action is reflected in the visible interface and activity history.

The demo is seeded with fictional data so judges can test the complete flow without creating an account.

## The hard parts

The hardest challenge was not calling a tool. It was maintaining one coherent state across a person clicking in the interface and an agent making several sequential calls.

We also had to design for ambiguity and consequences. “Handle childcare” cannot mean “message everyone and hope.” Village turns that broad intent into inspectable steps with explicit approval at the right boundaries.

## What we are proud of

- The WebMCP flow solves an end-to-end coordination problem rather than demonstrating isolated tools.
- Agent actions and direct UI actions share one visible source of truth.
- Confirmation is used for meaningful consent, not as decorative friction.
- Retries are safe and the history remains understandable.
- The app is useful as a family interface even when no agent is present.

## What we learned

The best agent experiences do not hide the interface. They make the shared interface more valuable.

WebMCP creates a powerful design constraint: expose the smallest meaningful actions, make state legible to both human and agent, and place trust boundaries inside the action model. That produced a calmer and more accountable product than unconstrained browser automation would have.

## What is next

The prototype focuses on a deterministic, judgeable family-care workflow. The next version would add:

- authenticated households and permissions;
- real-time invitations and responses;
- school calendar integrations and exception feeds;
- push notifications and escalation rules;
- privacy-aware data separation;
- integrations with employer rota and calendar systems;
- a portable audit record for care coordination.

The larger vision is a coordination layer for real-world support networks: families, neighbours, carers, and community services working with agents while people remain responsible for the commitments that affect one another.

## Judging-criteria map

| Criterion | Evidence in Village |
|---|---|
| WebMCP leverage | Four connected tool surfaces orchestrate rota intake, recurring patterns, gap detection, and a live multi-step Relay on the same state as the UI. |
| Execution | Complete seeded flow, visible state updates, confirmation gates, idempotent writes, and activity history. |
| Potential impact | Solves a recurring coordination burden for shift-working families and trusted support networks. |
| Creativity and ambition | Treats consent and multi-person commitments as first-class agent primitives, not just calendar CRUD. |

## Submission links

- Live app: https://village-family.jp-hickey.chatgpt.site
- Source repository: https://github.com/Village-Family/village-webmcp-challenge
- Demo video: _add the final public or unlisted YouTube URL_
