# Devpost submission draft

## Village Family

**Tagline:** The family coordination layer for shift work, childcare and real life.

## Inspiration

Village comes from a real problem. John and Tash both work shifts while raising
five-year-old twins. Their childcare support is a trusted network of parents,
in-laws and aunties, but coordinating it means rota screenshots, separate
calendars and repeated messages. Accepting one overtime shift can trigger a
small administrative crisis.

## What it does

Village turns rota screenshots, irregular multi-week shift patterns, overtime
and childcare into one shared family plan. A parent can scan a rota or describe
anything from a 6-on/4-off cycle to a different 42-day pattern. Village reviews
uncertain imports, generates the visible shifts without copying hundreds of
events, and lets the family change one occurrence, this-and-future, or the
entire series with the consequence made explicit.

When work creates a real childcare gap, Village runs one approved, bounded
Relay through trusted carers in order. A decline advances once; an acceptance
stops the chain immediately; people later in the list are visibly not contacted.

## Why WebMCP

Ordinary browser automation would have to infer dates, people and consequences
from visual controls. Village exposes the underlying family actions as precise
WebMCP tools while preserving the human interface and live page state. The
agent can reason across several structured steps; the family stays in control
of every consequential action.

This shared context makes possible something that was previously awkward:
moving from “I accepted overtime” to a confirmed family plan in one safe,
auditable conversation.

## Human and agent responsibilities

- The agent reads schedules, detects gaps and finds matching availability.
- The parent confirms calendar changes and approves the complete bounded Village Relay — the ranked carer order and response window — in one decision.
- The carer accepts or declines.
- Village records the actor and outcome and updates the shared plan.

## WebMCP implementation

The app registers a focused set of imperative tools through
`document.modelContext.registerTool()`. Inputs use strict JSON schemas and
outputs use stable IDs. Read operations are annotated with
`readOnlyHint: true`. Writes are idempotent, return machine-readable error
codes, reject stale previews, and require explicit confirmation for calendar
changes and starting a Relay. Rota Scan, Shift Patterns, the calendar and Relay
share one household revision, so an approval cannot silently commit after the
family plan changes. Tool executions update the same state that drives the
visible calendar, briefing, Relay chain and activity history.

## Built with

React 19, TypeScript, Vinext, WebMCP, ChatGPT Sites and Lucide.

## Demo prompt

> I’ve been called in on Tuesday from 4pm to 10pm. Sort the childcare without
> messaging everyone at once. Try Anne first, then Grandad, then Claire. Wait
> 15 minutes between requests and confirm the whole plan with me before
> contacting anyone.

## Privacy

The challenge build uses fictional demonstration data and contains no real
contact information, credentials or production family records.
