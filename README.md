# Village Family

Village is the family coordination layer for shift-working households. It turns
scattered rota screenshots, calendar clashes and childcare messages into one
shared plan that people and their agents can safely update together.

## WebMCP Challenge workflow

The challenge demo follows one real family problem:

1. Village reads a rota scan or creates a flexible repeating shift pattern.
2. John adds overtime for Tuesday, 1 September 2026.
3. Village compares both parents' real shifts and detects a childcare gap.
4. John approves one bounded Relay: Anne, then Grandad, then Claire.
5. Anne declines, so Village advances once. Grandad accepts, the Relay stops,
   and Claire is visibly marked **Not contacted**.

The interface and WebMCP tools operate on the same live in-page state. All
write tools are idempotent, consequential actions require confirmation, and
tool responses use stable object IDs.

## WebMCP surfaces

| Surface | What the agent can do safely |
| --- | --- |
| Family schedule | Read the shared plan, add approved overtime, detect real coverage gaps and get a calm daily briefing |
| Village Relay | Preview one ordered carer chain, commit it once, record responses and stop immediately on acceptance |
| Rota Scan | Prepare extracted shifts, expose ambiguity for review and atomically import only an approved plan |
| Shift Patterns | Create 1–84 day cycles, generate visible shifts, change one occurrence, stop a series, or edit this-and-future without rewriting history |

Every write is confirmation-gated where it changes a commitment, duplicate-safe,
and bound to the exact household revision that was previewed. The Rota Scan,
Pattern and Relay workflows feed one shared schedule rather than isolated demos.

## Run locally

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

### Test the Site tools (WebMCP)

Preferred path: use the latest ChatGPT desktop app, open Village in its built-in
browser, and select GPT-5.6 Sol or GPT-5.6 Terra. Site tools availability depends
on rollout and workspace settings.

For direct experimental Chrome testing, if your Chrome build exposes
`chrome://flags/#enable-webmcp-testing`, enable it, relaunch Chrome, and open
the app.

Try:

> I’ve been called in on Tuesday from 4pm to 10pm. Sort the childcare without
> messaging everyone at once. Try Anne first, then Grandad, then Claire. Wait
> 15 minutes between requests and confirm the whole plan with me before
> contacting anyone.

## Privacy

This public challenge build contains fictional demo data only. It has no real
contact details, authentication secrets or production family records.

## Licence

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).
