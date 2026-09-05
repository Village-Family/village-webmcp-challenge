# Village Calendar UX

## Product principle

The Calendar must be calm enough for grandparents to use without explanation and powerful enough for shift-working parents to plan weeks, months and the year ahead.

Default view: **Week**.
Available views: **Day / Week / Month / Year**.

The Calendar should answer three questions immediately:
1. Who is working?
2. Who is looking after the children?
3. Is the family covered?

## Persistent top bar

- Title: Calendar
- Large segmented control: Day / Week / Month / Year
- Today button
- Household filter button, defaulting to Everyone
- Add button with plain-language actions: Add shift / Add event / Ask the Village

The selected view should persist per user.

---

## Day view

Use when someone wants detail without interpreting a grid.

Header:
- Large date: Tuesday 16 September
- Coverage badge: Covered / Needs help / Waiting for replies

Sections in chronological order:
- Your shifts
- Partner shifts
- Childcare
- School / nursery
- Pickups and drop-offs
- Appointments and other family events

Each item is a large tappable card with:
- Person name
- Plain-language event type
- Time
- Optional location
- Status where relevant

If a childcare gap exists, show one prominent card:

**Childcare needed**
15:30–22:30
John and Tash are both working.
[Ask the Village]

Grandparent response view should offer two large actions only:
- Yes, I can help
- Sorry, I can’t

---

## Week view — DEFAULT

At the top, show seven large day buttons. Today is clearly highlighted.

Below, show one calm summary card per day rather than forcing users to read a dense hourly grid.

Example:

### Tuesday 16
John — Overtime 16:00–22:00
Tash — Late shift 14:00–22:00
Childcare — Grandad 15:30–22:30
**Covered**

### Wednesday 17
John — Rest day
Tash — Late shift 14:00–22:00
Childcare — Needed 15:30–22:30
**Needs help**
[Ask the Village]

Tapping a day opens Day view.

Optional secondary timeline mode can be added later for users who prefer a traditional hourly calendar, but it should not be the default.

---

## Month view

Purpose: see the shape of family life at a glance.

Use a conventional month grid, but keep cells visually quiet.

Each date should show no more than three simple indicators:
- shift indicator
- childcare indicator
- issue/status indicator

Do not cram event names into small cells.

Status language:
- green dot/check: Covered
- amber dot: Waiting
- rose/red dot: Needs help
- muted shift marker: Work scheduled

Tapping a date opens Day view.

Above the grid, show a short monthly summary:
- X shifts
- X childcare days
- X days need help

If there are unresolved childcare gaps, show:
**2 days still need childcare this month**
[Review them]

---

## Year view

Purpose: long-range planning, school holidays, shift patterns, leave and recurring childcare pressure.

Show all 12 months as large, tappable mini-calendars in a vertically scrollable layout on phone and a grid on tablet.

Each month should display only meaningful signals:
- work-heavy days
- confirmed childcare days
- unresolved childcare days
- annual leave / holidays

Do not show individual event labels at year scale.

At the top, show a calm annual summary such as:
- 186 work days planned
- 42 childcare days coordinated
- 3 unresolved days

Useful year-level overlays:
- School holidays
- Annual leave
- Shift patterns
- Birthdays / family dates

Tapping a month opens Month view. Tapping a date opens Day view.

---

## Colours and accessibility

Colours support meaning but never carry meaning alone.

- Covered: soft green + word “Covered”
- Waiting: soft amber + word “Waiting”
- Needs help: soft rose + word “Needs help”
- Shift/event: soft blue/lilac + explicit label

Accessibility requirements:
- Minimum 44×44px tap targets; target 48–56px for primary actions
- Large readable text by default
- Support iOS Dynamic Type / browser text scaling
- Avoid low-contrast grey text
- Never rely on swipe-only controls
- Every icon paired with text for primary navigation/action
- Confirmation before destructive or consequential actions

---

## Navigation behaviour

Bottom navigation remains:
Home / Calendar / Village / Requests / You

Calendar retains the user’s last selected Day/Week/Month/Year view.

When another screen links into a date, Calendar opens directly to that date in Day view.

When a notification says childcare is needed, tapping it opens the exact Day view and highlights the gap.

---

## Core calendar actions

Primary actions should always use plain language:
- Add shift
- Add overtime
- Add appointment
- Add school event
- Add pickup / drop-off
- Ask the Village
- Mark childcare covered

Avoid generic “Create event” wording where a more human action is possible.

---

## V1 build order

1. Week view and day-detail drawer/page
2. Month view
3. Year view
4. Day view editing
5. Household filters
6. Calendar integrations
7. Rota scan import
8. Advanced traditional timeline view, only if users actually want it

## Success test

A grandparent who has never used Village before should be able to open Calendar, identify whether childcare is needed on a given day, and respond appropriately without training or help.