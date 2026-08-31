# Village — 2:45 Demo Film

## The one-line story

**Village turns “I accepted overtime” into a confirmed family plan—without taking control away from the family.**

## Recording rules

- Keep the final video under 3:00; target 2:45.
- Record at 1440p or 1080p with browser zoom at 110–125%.
- Use the live app and the ChatGPT in-app browser side by side.
- Start from the seeded demo state. Hide bookmarks, notifications, and personal accounts.
- Do not speed up the agent interaction. The confirmation moments are the product.
- Add captions. Keep music low or omit it.

## Exact script and shot list

| Time | Picture | Voiceover / action |
|---|---|---|
| 0:00–0:15 | Tight shot of Tuesday in Village: both parents working and an uncovered childcare gap. | “For a shift-working family, one overtime shift can trigger a chain of messages, calendar edits, and last-minute childcare.” |
| 0:15–0:28 | Pull back to the full Village calendar and trusted carers. | “Village is a shared coordination surface for the whole family—and for an agent working with them.” |
| 0:28–0:45 | Show the initial calendar, the trusted village, and the activity panel. | “The calendar, trusted carers, availability, and decisions all live in one visible state. Nothing important happens silently.” |
| 0:45–1:04 | In ChatGPT, paste the Golden Judge Prompt below. | “I can describe the outcome once. The agent reads the live family plan through WebMCP and works out what needs to happen.” |
| 1:04–1:24 | Agent previews the overtime change. Pause on the confirmation UI, then approve. | “Adding work changes the family’s shared plan, so Village requires confirmation before the agent commits it.” |
| 1:24–1:38 | Return to Village. Show the new overtime block and the red “Childcare needed” status. | “The same interface updates immediately. The agent and the family are not working from separate copies.” |
| 1:38–2:00 | Agent previews the full Relay — Anne, then Grandad, then Claire, 15-minute window — and asks for one confirmation covering the whole chain. Approve. | “Contacting real people is a consequential, repeated action, so Village asks for one approval that covers the entire bounded chain — not one approval per person.” |
| 2:00–2:14 | Tell the agent, “Anne declines.” The card turns amber; Village advances to Grandad automatically, with no new prompt. | “A decline doesn’t stop the plan or ask the family to repeat themselves — the agent keeps moving inside the boundary it was already given.” |
| 2:14–2:30 | Tell the agent, “Grandad accepts.” Show the Relay turn green, the calendar update, and Claire marked “Not contacted.” | “The instant someone accepts, the relay stops. Claire is never contacted — and the interface proves it.” |
| 2:30–2:40 | Fast, readable close-ups: tool list or developer panel, stable IDs, confirmation badge, activity history. | “Underneath is a focused WebMCP tool suite, stable IDs, idempotent writes, confirmation gates, and an auditable history—all operating on the same state as the UI.” |
| 2:40–2:45 | Village wordmark over the now-covered Tuesday, Claire’s “Not contacted” pill visible. | “Most planning agents help one person make a plan. Village coordinates commitments between real people, where consent matters. The agent handles the coordination. The family keeps the decisions.” |

## Golden Judge Prompt

Paste this exactly:

> I’ve been called in on Tuesday from 4pm to 10pm. Sort the childcare without messaging everyone at once. Try Anne first, then Grandad, then Claire. Wait 15 minutes between requests and confirm the whole plan with me before contacting anyone.

Approve the overtime, then approve the complete Relay plan. Then say:

> Anne declines.

Then say:

> Grandad accepts.

## The three moments the camera must hold

1. **Before approval:** the agent explains the proposed calendar change.
2. **Shared-state update:** the overtime block and childcare gap appear in Village.
3. **Before outreach:** the agent asks permission to run the complete Anne → Grandad → Claire Relay — one approval, not one per person.

Those pauses prove that Village is not a chatbot glued to a calendar. WebMCP is the interaction model.

## Backup take

If the full agent run is unreliable during recording:

1. Record each confirmed action as a separate continuous clip.
2. Cut only between completed actions, never inside a tool call.
3. Keep the real tool result and UI state visible.
4. Have a clean seeded tab ready, but do not fake responses or composite UI states.

## Final pre-upload checklist

- [ ] Runtime is under 2:55.
- [ ] All text is legible on a phone.
- [ ] The words “WebMCP” and “confirmation” are spoken.
- [ ] The same state is visibly shared by agent and UI.
- [ ] No private data, account menus, keys, or personal notifications appear.
- [ ] Video is public or unlisted and playable without requesting access.
