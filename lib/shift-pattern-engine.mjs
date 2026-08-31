const OFF_CODE = "off";
const MAX_SEQUENCE_DAYS = 84;
const MAX_DEFINITIONS = 8;
const MAX_MATERIALIZED_DAYS = 366;

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "");
}

function dateValue(value) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value, days) {
  const date = dateValue(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.floor((dateValue(to) - dateValue(from)) / 86_400_000);
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const leftMax = leftEnd ?? "9999-12-31";
  const rightMax = rightEnd ?? "9999-12-31";
  return leftStart <= rightMax && rightStart <= leftMax;
}

function normalizeDefinitions(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0 || definitions.length > MAX_DEFINITIONS) {
    return { ok: false, code: "INVALID_SHIFT_DEFINITIONS" };
  }
  const map = {};
  for (const raw of definitions) {
    const code = String(raw.code ?? "").trim().toLowerCase();
    const label = String(raw.label ?? "").trim();
    if (!/^[a-z][a-z0-9_-]{0,19}$/.test(code) || code === OFF_CODE || map[code]) {
      return { ok: false, code: "INVALID_SHIFT_CODE", shift_code: code };
    }
    if (!label || label.length > 60 || !isValidTime(raw.start) || !isValidTime(raw.end)) {
      return { ok: false, code: "INVALID_SHIFT_DEFINITION", shift_code: code };
    }
    map[code] = { code, label, start: raw.start, end: raw.end };
  }
  return { ok: true, map };
}

function resolveEndDate(startDate, sequenceLength, repeat) {
  if (repeat?.mode === "indefinite") return { ok: true, endDate: null, cycles: null };
  if (repeat?.mode === "cycles") {
    const cycles = Number(repeat.cycles);
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 520) {
      return { ok: false, code: "INVALID_PATTERN_CYCLES" };
    }
    return { ok: true, endDate: addDays(startDate, (sequenceLength * cycles) - 1), cycles };
  }
  if (repeat?.mode === "until") {
    if (!isValidDate(repeat.untilDate) || repeat.untilDate < startDate) {
      return { ok: false, code: "INVALID_PATTERN_END_DATE" };
    }
    return { ok: true, endDate: repeat.untilDate, cycles: null };
  }
  return { ok: false, code: "INVALID_REPEAT_MODE" };
}

function materializeRule(rule, from, to, maximumDays = MAX_MATERIALIZED_DAYS) {
  const boundedStart = from < rule.startDate ? rule.startDate : from;
  const ruleEnd = rule.endDate ?? to;
  const boundedEnd = to > ruleEnd ? ruleEnd : to;
  if (boundedEnd < boundedStart) return [];
  const span = daysBetween(boundedStart, boundedEnd) + 1;
  if (span > maximumDays) throw new Error("MATERIALIZATION_RANGE_TOO_LARGE");

  const shifts = [];
  for (let offset = 0; offset < span; offset += 1) {
    const date = addDays(boundedStart, offset);
    const patternOffset = daysBetween(rule.startDate, date);
    const exception = rule.exceptions?.[date];
    const code = exception?.code ?? rule.sequence[patternOffset % rule.sequence.length];
    if (code === OFF_CODE) continue;
    const definition = exception?.definition ?? rule.definitions[code];
    if (!definition || !isValidTime(definition.start) || !isValidTime(definition.end)) {
      throw new Error("INVALID_STORED_SHIFT_DEFINITION");
    }
    const overnight = definition.end <= definition.start;
    shifts.push({
      id: `pattern-shift-${stableHash(`${rule.id}|${date}|${code}`)}`,
      type: "shift",
      source: "shift_pattern",
      sourcePatternId: rule.id,
      person: rule.person,
      code,
      label: definition.label,
      date,
      start: definition.start,
      endDate: overnight ? addDays(date, 1) : date,
      end: definition.end,
      overnight,
      timezone: rule.timezone,
    });
  }
  return shifts;
}

export function createPatternState(existingPatterns = []) {
  return { revision: 0, patterns: existingPatterns.map(item => ({ ...item })), idempotency: {} };
}

export function previewShiftPattern({
  person, startDate, sequence, definitions, repeat,
  timezone = "Europe/London", householdRevision = 0, existingPatterns = [], householdMembers = [],
}) {
  const allowedPeople = new Set(householdMembers.map(member => typeof member === "string" ? member : member?.name));
  if (!person || !allowedPeople.has(person)) {
    return { ok: false, code: "UNKNOWN_PERSON", allowed_people: [...allowedPeople].filter(Boolean) };
  }
  if (!isValidDate(startDate)) return { ok: false, code: "INVALID_PATTERN_START_DATE" };
  if (!Array.isArray(sequence) || sequence.length < 1 || sequence.length > MAX_SEQUENCE_DAYS) {
    return { ok: false, code: "INVALID_PATTERN_SEQUENCE" };
  }
  if (timezone !== "Europe/London") return { ok: false, code: "UNSUPPORTED_TIMEZONE" };

  const normalized = normalizeDefinitions(definitions);
  if (!normalized.ok) return normalized;
  const normalizedSequence = sequence.map(code => String(code).trim().toLowerCase());
  const unknownCode = normalizedSequence.find(code => code !== OFF_CODE && !normalized.map[code]);
  if (unknownCode) return { ok: false, code: "UNKNOWN_SHIFT_CODE", shift_code: unknownCode };
  if (normalizedSequence.every(code => code === OFF_CODE)) return { ok: false, code: "PATTERN_HAS_NO_SHIFTS" };

  const resolved = resolveEndDate(startDate, normalizedSequence.length, repeat);
  if (!resolved.ok) return resolved;
  const overlap = existingPatterns.find(pattern =>
    pattern.person === person && pattern.status === "active" &&
    rangesOverlap(startDate, resolved.endDate, pattern.startDate, pattern.endDate));
  if (overlap) return { ok: false, code: "PATTERN_RANGE_OVERLAP", existing_pattern_id: overlap.id };

  const canonical = JSON.stringify({
    person, startDate, sequence: normalizedSequence, definitions: normalized.map,
    repeat: { mode: repeat.mode, cycles: resolved.cycles, endDate: resolved.endDate }, timezone,
    householdRevision,
  });
  const planId = `pattern-plan-${stableHash(canonical)}`;
  const draftRule = {
    id: `pattern-${stableHash(planId)}`, person, startDate, endDate: resolved.endDate,
    sequence: normalizedSequence, definitions: normalized.map, timezone, status: "active",
  };
  const previewEnd = resolved.endDate && resolved.endDate < addDays(startDate, 13)
    ? resolved.endDate : addDays(startDate, 13);
  const sampleShifts = materializeRule(draftRule, startDate, previewEnd, 14);
  const totalDays = resolved.endDate ? daysBetween(startDate, resolved.endDate) + 1 : null;
  const shiftDaysPerCycle = normalizedSequence.filter(code => code !== OFF_CODE).length;
  const estimatedShifts = totalDays === null
    ? null
    : Math.floor(totalDays / normalizedSequence.length) * shiftDaysPerCycle +
      normalizedSequence.slice(0, totalDays % normalizedSequence.length).filter(code => code !== OFF_CODE).length;

  return {
    ok: true, planId, baseRevision: householdRevision, person, startDate,
    endDate: resolved.endDate, repeatMode: repeat.mode, sequence: normalizedSequence,
    definitions: normalized.map, timezone, totalDays, estimatedShifts,
    cycleLengthDays: normalizedSequence.length, shiftDaysPerCycle,
    sampleShifts, requiresConfirmation: true,
    summary: resolved.endDate
      ? `${person}: ${normalizedSequence.length}-day pattern from ${startDate} to ${resolved.endDate} (${estimatedShifts} shifts).`
      : `${person}: ${normalizedSequence.length}-day pattern from ${startDate}, continuing until stopped.`,
  };
}

export function commitShiftPattern(state, preview, { confirmed, idempotencyKey }) {
  if (!preview?.ok || !preview.planId) return { state, result: { ok: false, code: "PATTERN_PLAN_NOT_FOUND" } };
  if (confirmed !== true) return {
    state,
    result: { ok: false, code: "CONFIRMATION_REQUIRED", plan_id: preview.planId, preview: preview.summary },
  };
  if (!idempotencyKey || String(idempotencyKey).length < 4) {
    return { state, result: { ok: false, code: "INVALID_IDEMPOTENCY_KEY" } };
  }
  const previous = state.idempotency[idempotencyKey];
  if (previous) {
    if (previous !== preview.planId) return { state, result: { ok: false, code: "IDEMPOTENCY_KEY_CONFLICT", existing_plan_id: previous } };
    // The pattern this idempotency key originally created may since have been
    // replaced in place by an entire_series edit (same id, new sourcePlanId), so
    // it can no longer be found by sourcePlanId. Its id is still deterministic
    // from the same plan_id + idempotency_key that created it, so recompute it
    // rather than risk dereferencing a lookup that came back empty.
    const survivingPattern = state.patterns.find(item => item.sourcePlanId === preview.planId);
    const patternId = survivingPattern?.id ?? `pattern-${stableHash(`${preview.planId}|${idempotencyKey}`)}`;
    return { state, result: { ok: true, idempotent: true, pattern_id: patternId } };
  }
  if (state.revision !== preview.baseRevision) {
    return { state, result: { ok: false, code: "PATTERN_PLAN_STALE", current_revision: state.revision } };
  }
  const overlap = state.patterns.find(pattern =>
    pattern.person === preview.person && pattern.status === "active" &&
    rangesOverlap(preview.startDate, preview.endDate, pattern.startDate, pattern.endDate));
  if (overlap) return { state, result: { ok: false, code: "PATTERN_RANGE_OVERLAP", existing_pattern_id: overlap.id } };

  const pattern = {
    id: `pattern-${stableHash(`${preview.planId}|${idempotencyKey}`)}`,
    sourcePlanId: preview.planId,
    person: preview.person,
    startDate: preview.startDate,
    endDate: preview.endDate,
    sequence: preview.sequence,
    definitions: preview.definitions,
    timezone: preview.timezone,
    status: "active",
  };
  const next = {
    ...state, revision: state.revision + 1,
    patterns: [...state.patterns, pattern],
    idempotency: { ...state.idempotency, [idempotencyKey]: preview.planId },
  };
  return { state: next, result: { ok: true, pattern_id: pattern.id, new_revision: next.revision } };
}

export function previewStopShiftPattern({ pattern, effectiveDate, householdRevision = 0 }) {
  if (!pattern) return { ok: false, code: "SHIFT_PATTERN_NOT_FOUND" };
  if (pattern.status !== "active") return { ok: false, code: "SHIFT_PATTERN_NOT_ACTIVE", pattern_id: pattern.id };
  if (!isValidDate(effectiveDate) || effectiveDate < pattern.startDate || (pattern.endDate && effectiveDate > pattern.endDate)) {
    return { ok: false, code: "INVALID_STOP_DATE", pattern_id: pattern.id };
  }
  const planId = `pattern-stop-${stableHash(`${pattern.id}|${effectiveDate}|${householdRevision}`)}`;
  return {
    ok: true, planId, patternId: pattern.id, effectiveDate, baseRevision: householdRevision,
    requiresConfirmation: true,
    summary: `Stop ${pattern.person}'s repeating pattern from ${effectiveDate}. Earlier shifts stay unchanged.`,
  };
}

export function commitStopShiftPattern(state, preview, { confirmed, idempotencyKey }) {
  if (!preview?.ok || !preview.planId) return { state, result: { ok: false, code: "PATTERN_STOP_PLAN_NOT_FOUND" } };
  if (confirmed !== true) return { state, result: { ok: false, code: "CONFIRMATION_REQUIRED", plan_id: preview.planId, preview: preview.summary } };
  if (!idempotencyKey || String(idempotencyKey).length < 4) return { state, result: { ok: false, code: "INVALID_IDEMPOTENCY_KEY" } };
  const previous = state.idempotency[idempotencyKey];
  if (previous) {
    if (previous !== preview.planId) return { state, result: { ok: false, code: "IDEMPOTENCY_KEY_CONFLICT", existing_plan_id: previous } };
    return { state, result: { ok: true, idempotent: true, pattern_id: preview.patternId, stops_on: preview.effectiveDate } };
  }
  if (state.revision !== preview.baseRevision) return { state, result: { ok: false, code: "PATTERN_PLAN_STALE", current_revision: state.revision } };
  const pattern = state.patterns.find(item => item.id === preview.patternId);
  if (!pattern || pattern.status !== "active") return { state, result: { ok: false, code: "SHIFT_PATTERN_NOT_ACTIVE", pattern_id: preview.patternId } };
  const nextPatterns = state.patterns.map(item => item.id === preview.patternId
    ? { ...item, endDate: addDays(preview.effectiveDate, -1), stopsOn: preview.effectiveDate }
    : item);
  const next = {
    ...state, revision: state.revision + 1, patterns: nextPatterns,
    idempotency: { ...state.idempotency, [idempotencyKey]: preview.planId },
  };
  return { state: next, result: { ok: true, pattern_id: preview.patternId, stops_on: preview.effectiveDate, new_revision: next.revision } };
}

export function previewPatternException({ pattern, date, code, definition, householdRevision = 0 }) {
  if (!pattern) return { ok: false, code: "SHIFT_PATTERN_NOT_FOUND" };
  if (!isValidDate(date) || date < pattern.startDate || (pattern.endDate && date > pattern.endDate)) {
    return { ok: false, code: "INVALID_EXCEPTION_DATE", pattern_id: pattern.id };
  }
  const normalizedCode = String(code ?? "").trim().toLowerCase();
  let normalizedDefinition = null;
  if (normalizedCode !== OFF_CODE) {
    normalizedDefinition = definition ?? pattern.definitions[normalizedCode];
    if (!normalizedDefinition || !isValidTime(normalizedDefinition.start) || !isValidTime(normalizedDefinition.end)) {
      return { ok: false, code: "INVALID_EXCEPTION_SHIFT", shift_code: normalizedCode };
    }
    normalizedDefinition = {
      code: normalizedCode, label: String(normalizedDefinition.label ?? "Changed shift").slice(0, 60),
      start: normalizedDefinition.start, end: normalizedDefinition.end,
    };
  }
  const planId = `pattern-exception-${stableHash(`${pattern.id}|${date}|${normalizedCode}|${JSON.stringify(normalizedDefinition)}|${householdRevision}`)}`;
  return {
    ok: true, planId, patternId: pattern.id, date, code: normalizedCode,
    definition: normalizedDefinition, baseRevision: householdRevision, requiresConfirmation: true,
    summary: normalizedCode === OFF_CODE
      ? `Make ${date} a rest day for ${pattern.person}; the repeating pattern stays unchanged.`
      : `Change only ${date} for ${pattern.person} to ${normalizedDefinition.label} ${normalizedDefinition.start}–${normalizedDefinition.end}.`,
  };
}

export function commitPatternException(state, preview, { confirmed, idempotencyKey }) {
  if (!preview?.ok || !preview.planId) return { state, result: { ok: false, code: "PATTERN_EXCEPTION_PLAN_NOT_FOUND" } };
  if (confirmed !== true) return { state, result: { ok: false, code: "CONFIRMATION_REQUIRED", plan_id: preview.planId, preview: preview.summary } };
  if (!idempotencyKey || String(idempotencyKey).length < 4) return { state, result: { ok: false, code: "INVALID_IDEMPOTENCY_KEY" } };
  const previous = state.idempotency[idempotencyKey];
  if (previous) {
    if (previous !== preview.planId) return { state, result: { ok: false, code: "IDEMPOTENCY_KEY_CONFLICT", existing_plan_id: previous } };
    return { state, result: { ok: true, idempotent: true, pattern_id: preview.patternId, date: preview.date } };
  }
  if (state.revision !== preview.baseRevision) return { state, result: { ok: false, code: "PATTERN_PLAN_STALE", current_revision: state.revision } };
  const pattern = state.patterns.find(item => item.id === preview.patternId);
  if (!pattern || pattern.status !== "active") return { state, result: { ok: false, code: "SHIFT_PATTERN_NOT_ACTIVE", pattern_id: preview.patternId } };
  const exception = { code: preview.code, definition: preview.definition, sourcePlanId: preview.planId };
  const nextPatterns = state.patterns.map(item => item.id === preview.patternId
    ? { ...item, exceptions: { ...(item.exceptions ?? {}), [preview.date]: exception } }
    : item);
  const next = {
    ...state, revision: state.revision + 1, patterns: nextPatterns,
    idempotency: { ...state.idempotency, [idempotencyKey]: preview.planId },
  };
  return { state: next, result: { ok: true, pattern_id: preview.patternId, date: preview.date, new_revision: next.revision } };
}

export function previewEditShiftPattern({
  pattern, scope, effectiveDate, sequence, definitions, repeat,
  householdRevision = 0, existingPatterns = [], householdMembers = [],
}) {
  if (!pattern) return { ok: false, code: "SHIFT_PATTERN_NOT_FOUND" };
  if (pattern.status !== "active") return { ok: false, code: "SHIFT_PATTERN_NOT_ACTIVE", pattern_id: pattern.id };
  if (!["this_and_future", "entire_series"].includes(scope)) {
    return { ok: false, code: "INVALID_PATTERN_EDIT_SCOPE" };
  }
  const editStart = scope === "entire_series" ? pattern.startDate : effectiveDate;
  if (!isValidDate(editStart) || editStart < pattern.startDate || (pattern.endDate && editStart > pattern.endDate)) {
    return { ok: false, code: "INVALID_PATTERN_EDIT_DATE", pattern_id: pattern.id };
  }
  const replacement = previewShiftPattern({
    person: pattern.person, startDate: editStart, sequence, definitions, repeat,
    timezone: pattern.timezone, householdRevision,
    existingPatterns: existingPatterns.filter(item => item.id !== pattern.id), householdMembers,
  });
  if (!replacement.ok) return replacement;
  const planId = `pattern-edit-${stableHash(`${pattern.id}|${scope}|${effectiveDate ?? ""}|${replacement.planId}|${householdRevision}`)}`;
  return {
    ...replacement, planId, replacementPlanId: replacement.planId,
    patternId: pattern.id, scope, effectiveDate: editStart, baseRevision: householdRevision,
    summary: scope === "this_and_future"
      ? `Change ${pattern.person}'s repeating pattern from ${editStart}. Earlier shifts stay unchanged; future shifts use the reviewed ${replacement.cycleLengthDays}-day pattern.`
      : `Replace ${pattern.person}'s entire pattern from ${pattern.startDate} with the reviewed ${replacement.cycleLengthDays}-day pattern. This can change past displayed shifts.`,
  };
}

export function commitEditShiftPattern(state, preview, { confirmed, idempotencyKey }) {
  if (!preview?.ok || !preview.planId) return { state, result: { ok: false, code: "PATTERN_EDIT_PLAN_NOT_FOUND" } };
  if (confirmed !== true) return {
    state, result: { ok: false, code: "CONFIRMATION_REQUIRED", plan_id: preview.planId, preview: preview.summary },
  };
  if (!idempotencyKey || String(idempotencyKey).length < 4) {
    return { state, result: { ok: false, code: "INVALID_IDEMPOTENCY_KEY" } };
  }
  const previous = state.idempotency[idempotencyKey];
  if (previous) {
    if (previous !== preview.planId) return { state, result: { ok: false, code: "IDEMPOTENCY_KEY_CONFLICT", existing_plan_id: previous } };
    const replacement = state.patterns.find(item => item.sourcePlanId === preview.planId);
    return { state, result: { ok: true, idempotent: true, pattern_id: replacement?.id ?? preview.patternId } };
  }
  if (state.revision !== preview.baseRevision) {
    return { state, result: { ok: false, code: "PATTERN_PLAN_STALE", current_revision: state.revision } };
  }
  const original = state.patterns.find(item => item.id === preview.patternId);
  if (!original || original.status !== "active") {
    return { state, result: { ok: false, code: "SHIFT_PATTERN_NOT_ACTIVE", pattern_id: preview.patternId } };
  }

  const exceptions = Object.fromEntries(Object.entries(original.exceptions ?? {}).filter(([date]) =>
    date >= preview.effectiveDate && (!preview.endDate || date <= preview.endDate)));
  const replacement = {
    id: preview.scope === "entire_series"
      ? original.id
      : `pattern-${stableHash(`${preview.planId}|${idempotencyKey}`)}`,
    sourcePlanId: preview.planId, replacesPatternId: original.id,
    person: preview.person, startDate: preview.effectiveDate, endDate: preview.endDate,
    sequence: preview.sequence, definitions: preview.definitions, timezone: preview.timezone,
    status: "active", exceptions,
  };
  const replacesWholeOriginal = preview.scope === "entire_series" || preview.effectiveDate === original.startDate;
  const patterns = replacesWholeOriginal
    ? state.patterns.map(item => item.id === original.id ? replacement : item)
    : state.patterns.map(item => item.id === original.id
      ? { ...item, endDate: addDays(preview.effectiveDate, -1), supersededFrom: preview.effectiveDate }
      : item).concat(replacement);
  const next = {
    ...state, revision: state.revision + 1, patterns,
    idempotency: { ...state.idempotency, [idempotencyKey]: preview.planId },
  };
  return {
    state: next,
    result: {
      ok: true, pattern_id: replacement.id, replaced_pattern_id: original.id,
      scope: preview.scope, effective_date: preview.effectiveDate, new_revision: next.revision,
    },
  };
}

export function materializePattern(pattern, { from, to }) {
  if (!isValidDate(from) || !isValidDate(to) || to < from) {
    return { ok: false, code: "INVALID_MATERIALIZATION_RANGE" };
  }
  if (daysBetween(from, to) + 1 > MAX_MATERIALIZED_DAYS) {
    return { ok: false, code: "MATERIALIZATION_RANGE_TOO_LARGE", maximum_days: MAX_MATERIALIZED_DAYS };
  }
  try {
    if (!pattern || !isValidDate(pattern.startDate) || !Array.isArray(pattern.sequence) || pattern.sequence.length < 1 ||
        !pattern.definitions || typeof pattern.definitions !== "object") {
      return { ok: false, code: "INVALID_STORED_PATTERN", pattern_id: pattern?.id ?? null };
    }
    return { ok: true, pattern_id: pattern.id, shifts: materializeRule(pattern, from, to) };
  } catch (error) {
    return {
      ok: false, code: "INVALID_STORED_PATTERN", pattern_id: pattern?.id ?? null,
      reason: error instanceof Error ? error.message : "UNKNOWN_PATTERN_ERROR",
    };
  }
}
