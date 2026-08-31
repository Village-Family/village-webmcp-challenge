import { materializePattern } from "./shift-pattern-engine.mjs";

const SOURCE_PRIORITY = { manual: 4, rota_scan: 3, shift_pattern: 2, demo: 1 };
const MAX_RANGE_DAYS = 366;

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf());
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "");
}

function dayNumber(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).valueOf() / 86_400_000);
}

function point(date, time) {
  const [hours, minutes] = time.split(":").map(Number);
  return dayNumber(date) * 1440 + hours * 60 + minutes;
}

function dateTime(totalMinutes) {
  const day = Math.floor(totalMinutes / 1440);
  const minutes = totalMinutes - day * 1440;
  return {
    date: new Date(day * 86_400_000).toISOString().slice(0, 10),
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
  };
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Returns { ok: true, interval: {start,end} | null } for well-formed input (interval
// is null only when the date/time strings themselves don't parse), or
// { ok: false, code } for a degenerate but well-formed interval that must be
// rejected rather than silently reinterpreted or dropped:
//   - no endDate and start === end: genuinely zero-duration, not a real commitment.
//   - no endDate and end < start: a legitimately *derived* overnight shift
//     (e.g. 22:00-06:00) - still resolved onto the next day, exactly as before.
//   - an explicit endDate that still produces a non-positive interval: malformed
//     data (e.g. an overnight shift given the same-day endDate by mistake), not
//     something to quietly filter out.
function eventInterval(event) {
  if (!validDate(event.date) || !validDate(event.endDate ?? event.date) ||
      !validTime(event.start) || !validTime(event.end)) return { ok: true, interval: null };
  const start = point(event.date, event.start);
  let end = point(event.endDate ?? event.date, event.end);
  if (!event.endDate) {
    if (end === start) return { ok: false, code: "ZERO_DURATION_EVENT" };
    if (end < start) end += 1440;
  }
  if (end <= start) return { ok: false, code: "INVALID_EVENT_INTERVAL" };
  return { ok: true, interval: { start, end } };
}

function eventKey(event) {
  return [event.person, event.date, event.start, event.endDate ?? event.date, event.end].join("|");
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval, eventIds: [...interval.eventIds] });
    else {
      previous.end = Math.max(previous.end, interval.end);
      previous.eventIds = [...new Set([...previous.eventIds, ...interval.eventIds])];
    }
  }
  return merged;
}

function intersectIntervalSets(left, right) {
  const result = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const start = Math.max(left[leftIndex].start, right[rightIndex].start);
    const end = Math.min(left[leftIndex].end, right[rightIndex].end);
    if (start < end) result.push({
      start, end,
      eventIds: [...new Set([...left[leftIndex].eventIds, ...right[rightIndex].eventIds])],
    });
    if (left[leftIndex].end < right[rightIndex].end) leftIndex += 1;
    else rightIndex += 1;
  }
  return result;
}

/** Merge committed rota scans, compact recurring patterns and manual calendar events. */
export function buildUnifiedSchedule({ importedShifts = [], patterns = [], manualEvents = [], from, to }) {
  if (!validDate(from) || !validDate(to) || to < from) return { ok: false, code: "INVALID_SCHEDULE_RANGE" };
  if (dayNumber(to) - dayNumber(from) + 1 > MAX_RANGE_DAYS) {
    return { ok: false, code: "SCHEDULE_RANGE_TOO_LARGE", maximum_days: MAX_RANGE_DAYS };
  }

  const generated = [];
  for (const pattern of patterns.filter(item => item.status === "active")) {
    const materialized = materializePattern(pattern, { from, to });
    if (!materialized.ok) return materialized;
    generated.push(...materialized.shifts);
  }

  const allEvents = [...generated, ...importedShifts, ...manualEvents];
  const ids = new Map();
  for (const event of allEvents) {
    if (!event?.id) return { ok: false, code: "MISSING_EVENT_ID" };
    const fingerprint = eventKey(event);
    if (ids.has(event.id) && ids.get(event.id) !== fingerprint) {
      return { ok: false, code: "DUPLICATE_EVENT_ID", event_id: event.id };
    }
    ids.set(event.id, fingerprint);
    const check = eventInterval(event);
    if (!check.ok) return { ok: false, code: check.code, event_id: event.id };
  }
  const candidates = allEvents
    .filter(event => {
      const interval = eventInterval(event).interval;
      return interval && interval.end > point(from, "00:00") && interval.start < point(to, "00:00") + 1440;
    });
  const selected = new Map();
  const suppressed = [];
  for (const event of candidates) {
    const key = eventKey(event);
    const existing = selected.get(key);
    if (!existing) selected.set(key, event);
    else if ((SOURCE_PRIORITY[event.source] ?? 0) > (SOURCE_PRIORITY[existing.source] ?? 0)) {
      suppressed.push({ event: existing, duplicateOf: event.id });
      selected.set(key, event);
    } else suppressed.push({ event, duplicateOf: existing.id });
  }
  const events = [...selected.values()].sort((left, right) =>
    eventInterval(left).interval.start - eventInterval(right).interval.start || String(left.person).localeCompare(String(right.person)));
  return {
    ok: true, from, to, timezone: "Europe/London", events, suppressedDuplicates: suppressed,
    counts: {
      total: events.length,
      manual: events.filter(item => item.source === "manual").length,
      scanned: events.filter(item => item.source === "rota_scan").length,
      recurring: events.filter(item => item.source === "shift_pattern").length,
      duplicatesSuppressed: suppressed.length,
    },
  };
}

/** Find periods where every named guardian is unavailable inside an explicit care window. */
export function detectChildcareGaps({ events = [], careWindows = [], guardians = ["John", "Tash"] }) {
  if (!Array.isArray(guardians) || guardians.length < 1 || new Set(guardians).size !== guardians.length) {
    return { ok: false, code: "INVALID_GUARDIANS" };
  }
  for (const event of events) {
    const check = eventInterval(event);
    if (!check.ok) return { ok: false, code: check.code, event_id: event.id ?? null };
  }
  const gaps = [];
  for (const window of careWindows) {
    if (!validDate(window.date) || (window.endDate && !validDate(window.endDate)) ||
        !validTime(window.start) || !validTime(window.end)) {
      return { ok: false, code: "INVALID_CARE_WINDOW", window_id: window.id ?? null };
    }
    const windowStart = point(window.date, window.start);
    let windowEnd = point(window.endDate ?? window.date, window.end);
    if (!window.endDate) {
      if (windowEnd === windowStart) return { ok: false, code: "ZERO_DURATION_CARE_WINDOW", window_id: window.id ?? null };
      if (windowEnd < windowStart) windowEnd += 1440;
    }
    if (windowEnd <= windowStart) return { ok: false, code: "INVALID_CARE_WINDOW", window_id: window.id ?? null };

    const byGuardian = new Map();
    for (const guardian of guardians) {
      const intervals = events.filter(event => event.person === guardian && event.blocksCare !== false)
        .map(event => ({ interval: eventInterval(event).interval, event }))
        .filter(item => item.interval && item.interval.start < windowEnd && item.interval.end > windowStart)
        .map(item => ({
          start: Math.max(item.interval.start, windowStart),
          end: Math.min(item.interval.end, windowEnd),
          eventIds: [item.event.id],
        }));
      byGuardian.set(guardian, mergeIntervals(intervals));
    }
    let overlaps = byGuardian.get(guardians[0]);
    for (const guardian of guardians.slice(1)) overlaps = intersectIntervalSets(overlaps, byGuardian.get(guardian));

    for (const overlap of overlaps) {
      const start = dateTime(overlap.start);
      const end = dateTime(overlap.end);
      const causes = overlap.eventIds.map(id => events.find(event => event.id === id)).filter(Boolean);
      const gapId = window.gapId ?? `gap-${stableHash(`${window.id ?? window.date}|${overlap.start}|${overlap.end}|${guardians.join("|")}`)}`;
      gaps.push({
        id: gapId, careWindowId: window.id ?? null,
        children: window.children ?? [], date: start.date, start: start.time,
        endDate: end.date, end: end.time, timezone: window.timezone ?? "Europe/London",
        guardians, causeEventIds: overlap.eventIds,
        reason: guardians.map(guardian => {
          const labels = causes.filter(event => event.person === guardian).map(event => event.label ?? event.type ?? "commitment");
          return `${guardian}: ${labels.join(" + ")}`;
        }).join("; "),
        relayReady: true,
      });
    }
  }
  return { ok: true, gaps, gapFound: gaps.length > 0 };
}

export function buildFamilyScheduleSnapshot(input) {
  const schedule = buildUnifiedSchedule(input);
  if (!schedule.ok) return schedule;
  const coverage = detectChildcareGaps({
    events: schedule.events,
    careWindows: input.careWindows,
    guardians: input.guardians,
  });
  if (!coverage.ok) return coverage;
  return { ok: true, schedule, coverage };
}
