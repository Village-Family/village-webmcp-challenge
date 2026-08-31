# Judge Guide

## Try Village in 90 seconds

**Live app:** https://village-family.jp-hickey.chatgpt.site

Village is designed to be opened inside ChatGPT’s in-app browser so an agent can discover and call its WebMCP tools. No login is required. All names and schedule data in the demo are fictional.

## Recommended test

1. Open the live app in ChatGPT’s in-app browser.
2. Paste:

   > I’ve been called in on Tuesday from 4pm to 10pm. Sort the childcare without messaging everyone at once. Try Anne first, then Grandad, then Claire. Wait 15 minutes between requests and confirm the whole plan with me before contacting anyone.

3. Approve the overtime/calendar change when asked.
4. Approve the full Relay plan (order + response window) when asked — this is a single one-time approval that covers the entire chain, not one approval per carer.
5. Then say:

   > Anne declines.

   Village advances to Grandad automatically — no repeat approval needed for an already-approved step.
6. Then say:

   > Grandad accepts.

## Expected result

- The agent reads the current family plan rather than relying on text copied into chat.
- The overtime shift is previewed before it is committed.
- Tuesday updates in the visible Village interface.
- Village detects an uncovered childcare gap.
- The agent previews a bounded, ordered Relay across the trusted village and requires one explicit confirmation before contacting anyone.
- Anne’s decline advances the Relay to Grandad automatically, with no further approval prompt.
- Grandad’s acceptance stops the Relay immediately, covers the gap, and updates the shared calendar.
- Claire is visibly marked **“Not contacted”** — she was never asked, because the chain stopped the instant Grandad accepted.
- The activity history records every consequential action: the overtime, the Relay approval, Anne’s decline, the automatic advance, and Grandad’s acceptance.

## Optional 45-second rota proof

After the Relay flow, ask:

> Show me Tash’s repeating pattern, then preview changing it from 5 September to Day, Off repeating. Do not save it until I confirm.

The preview must say that earlier shifts stay unchanged. Approve it, then read the generated shifts again. This demonstrates a flexible 1–84 day rota, an explicit “this and future” boundary, and the same shared schedule feeding childcare detection.

## What this demonstrates

### Native WebMCP leverage

Village exposes focused imperative tools across four connected surfaces: the family schedule, Rota Scan, Shift Patterns, and Relay. The agent can safely move from an irregular rota to a real childcare gap and then through an approved carer chain. The agent and the family operate on the same live state — the same `transition()` state engine drives both the UI buttons and every WebMCP tool call.

### Human authority

Calendar writes and communication with other people are confirmation-gated. The agent coordinates; it does not silently make family commitments.

### Reliable execution

Writes use stable identifiers and idempotency keys. Repeating an approved call does not duplicate a shift or request. Activity history makes the final state explainable.

### Real-world impact

A change in one person’s work can affect several people. Village compresses a fragmented workflow—calendar checks, messages, availability, follow-up, and shared understanding—into one controlled interaction.

## Why this is distinct

Most agent-native planning products help one user create or edit a plan. Village coordinates commitments among multiple real people, where availability, trust, consent, and accountability matter.

## Reset / troubleshooting

- Refreshing the page restores the seeded demo if the session has become confusing.
- Use one action at a time if the browser asks for confirmation.
- If a repeated call returns an existing result, that is intentional idempotency rather than a failure.
- The web interface remains usable without an agent; WebMCP adds orchestration, not a separate hidden experience.
