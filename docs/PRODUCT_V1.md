# Village Product V1

This branch is isolated from the WebMCP Challenge submission. Do not merge or deploy it to the competition build before judging is complete.

## Goal

Turn Village from a public fictional-data demo into a real household coordination product that can be installed on phones and used every day.

## V1 definition of done

A household can:

- create secure accounts and sign in;
- create or join one household;
- invite a partner or trusted carer;
- manage household roles and permissions;
- add shifts and household commitments;
- create a childcare request for a real date/time window;
- send that request to selected carers;
- record yes/no responses and stop the relay on acceptance;
- receive push notifications for requests, responses, changes and overtime;
- review a single shared schedule backed by persistent data;
- install Village on iOS/Android as a phone-first app experience.

## Delivery order

### Phase 1 — Product foundation

1. Connect the dedicated Village Supabase project only.
2. Add Supabase client/server integration.
3. Add authentication.
4. Add households, memberships and role model.
5. Add RLS for every exposed table.
6. Replace fictional in-page persistence with repository-backed household data while preserving the WebMCP domain logic.

### Phase 2 — Household workflows

1. Persist shifts, events and childcare gaps.
2. Persist carers and invitations.
3. Persist Relay requests and responses.
4. Add confirmation/audit records for consequential actions.
5. Add realtime household updates where useful.

### Phase 3 — Mobile app

1. Make the interface fully phone-first.
2. Add PWA metadata and installability.
3. Add Capacitor/native shell if required for App Store / Play distribution.
4. Add native push notifications.
5. Add camera/photo access for rota scans.
6. Add app badges, deep links and share handling.

### Phase 4 — Remove manual work

1. Microsoft 365 / Outlook calendar integration.
2. Google Calendar integration.
3. Rota photo upload and reviewed extraction.
4. Strong repeating and irregular shift-pattern support.
5. Overtime, delays, appointments, pickups and drop-offs.

## Proposed data model

- profiles
- households
- household_members
- household_invites
- carers
- shifts
- events
- childcare_requests
- childcare_request_recipients
- childcare_responses
- relay_runs
- relay_attempts
- notification_preferences
- device_push_tokens
- audit_events

All household-owned records must carry a household_id and be protected by RLS based on membership. Authorization must not rely on user-editable metadata.

## Product guardrails

- Keep Sentry infrastructure, data and credentials completely separate.
- Never expose Supabase service-role credentials to the client.
- RLS on all exposed tables before real family data is written.
- Preserve confirmation gates for consequential actions.
- Never contact a carer who is marked Not contacted after another carer accepts.
- Treat rota extraction as review-before-import, never silent import.
- Keep main/live challenge submission unchanged during judging.

## First implementation task

Once the Village Supabase project is visible to the connected Supabase tool, inspect the empty/current schema and implement the Phase 1 schema + RLS, verify it with test queries and security advisors, then wire authentication into this branch.
