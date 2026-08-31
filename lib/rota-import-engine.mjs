const LOW_CONFIDENCE_THRESHOLD = 0.82;
const MAX_SHIFT_HOURS = 16;
const MAX_SOURCE_ROW_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 80;
const MAX_SOURCE_TEXT_LENGTH = 240;
const MAX_AMBIGUITY_FLAGS = 8;

export function createRotaState(existingEvents = []) {
  return {
    revision: 0,
    scheduleEvents: existingEvents.map(event => ({ ...event })),
    committedImports: [],
    idempotency: {},
  };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "");
}

function minutes(value) {
  const [hours, mins] = value.split(":").map(Number);
  return (hours * 60) + mins;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function eventKey(event) {
  return [event.person, event.date, event.start, event.endDate ?? event.date, event.end].join("|");
}

function normalizeCandidate(candidate, index, allowedPeople) {
  const errors = [];
  const warnings = [];
  const sourceRowId = String(candidate.sourceRowId ?? `row-${index + 1}`);
  const confidence = Number(candidate.confidence ?? 0);
  const label = String(candidate.label ?? "Shift");
  const sourceText = String(candidate.sourceText ?? "");
  const ambiguityFlags = Array.isArray(candidate.ambiguityFlags)
    ? candidate.ambiguityFlags.map(String)
    : [];

  if (!sourceRowId || sourceRowId.length > MAX_SOURCE_ROW_ID_LENGTH) errors.push("INVALID_SOURCE_ROW_ID");
  if (!allowedPeople.has(candidate.person)) errors.push("UNKNOWN_PERSON");
  if (!isValidDate(candidate.date)) errors.push("INVALID_DATE");
  if (!isValidTime(candidate.start)) errors.push("INVALID_START_TIME");
  if (!isValidTime(candidate.end)) errors.push("INVALID_END_TIME");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push("INVALID_CONFIDENCE");
  if (!label || label.length > MAX_LABEL_LENGTH) errors.push("INVALID_LABEL");
  if (sourceText.length > MAX_SOURCE_TEXT_LENGTH) errors.push("SOURCE_TEXT_TOO_LONG");
  if (ambiguityFlags.length > MAX_AMBIGUITY_FLAGS || ambiguityFlags.some(flag => flag.length > 48)) {
    errors.push("INVALID_AMBIGUITY_FLAGS");
  }

  let endDate = candidate.date;
  let overnight = false;
  let durationMinutes = null;
  if (errors.length === 0) {
    const startMinutes = minutes(candidate.start);
    const endMinutes = minutes(candidate.end);
    overnight = endMinutes <= startMinutes;
    endDate = overnight ? addDays(candidate.date, 1) : candidate.date;
    durationMinutes = overnight ? (1440 - startMinutes) + endMinutes : endMinutes - startMinutes;
    if (durationMinutes < 30) errors.push("SHIFT_TOO_SHORT");
    if (durationMinutes > MAX_SHIFT_HOURS * 60) errors.push("SHIFT_TOO_LONG");
  }

  if (confidence < LOW_CONFIDENCE_THRESHOLD) warnings.push("LOW_CONFIDENCE");
  for (const flag of ambiguityFlags) warnings.push(flag);

  return {
    sourceRowId,
    person: candidate.person,
    date: candidate.date,
    start: candidate.start,
    endDate,
    end: candidate.end,
    overnight,
    durationMinutes,
    label,
    confidence,
    sourceText,
    errors,
    warnings: [...new Set(warnings)],
    status: errors.length ? "invalid" : warnings.length ? "needs_review" : "ready",
  };
}

export function buildRotaPreview({ candidates, existingEvents = [], householdRevision = 0, person, householdMembers = [] }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { ok: false, code: "NO_SHIFT_CANDIDATES", message: "No shifts were extracted from the rota." };
  }
  if (candidates.length > 31) {
    return { ok: false, code: "TOO_MANY_SHIFT_CANDIDATES", maximum: 31 };
  }
  const allowedPeople = new Set(householdMembers.map(member => typeof member === "string" ? member : member?.name));
  if (!person || !allowedPeople.has(person)) {
    return { ok: false, code: "UNKNOWN_PERSON", allowed_people: [...allowedPeople].filter(Boolean) };
  }

  const existingKeys = new Set(existingEvents.map(eventKey));
  const previewKeys = new Set();
  const sourceRowIds = new Set();
  const rows = candidates.map((rawCandidate, index) => {
    const candidate = { ...rawCandidate, person };
    let row = normalizeCandidate(candidate, index, allowedPeople);
    if (sourceRowIds.has(row.sourceRowId)) {
      row = {
        ...row,
        status: "invalid",
        errors: [...new Set([...row.errors, "DUPLICATE_SOURCE_ROW_ID"])],
      };
    }
    sourceRowIds.add(row.sourceRowId);
    if (row.status === "invalid") return row;
    const key = eventKey(row);
    if (existingKeys.has(key) || previewKeys.has(key)) {
      return { ...row, status: "duplicate", warnings: [...row.warnings, "DUPLICATE_SHIFT"] };
    }
    previewKeys.add(key);
    return row;
  });

  const canonical = JSON.stringify({ householdRevision, person, rows: rows.map(row => ({
    sourceRowId: row.sourceRowId,
    date: row.date,
    start: row.start,
    endDate: row.endDate,
    end: row.end,
    label: row.label,
    confidence: row.confidence,
    sourceText: row.sourceText,
    errors: row.errors,
    warnings: row.warnings,
    status: row.status,
  })) });
  const planId = `rota-plan-${stableHash(canonical)}`;
  const counts = rows.reduce((result, row) => ({
    ...result,
    [row.status]: result[row.status] + 1,
  }), { ready: 0, needs_review: 0, duplicate: 0, invalid: 0 });

  return {
    ok: true,
    planId,
    baseRevision: householdRevision,
    person,
    rows,
    counts,
    canCommit: counts.ready > 0 && counts.needs_review === 0 && counts.invalid === 0,
    requiresConfirmation: true,
    summary: `${counts.ready} shift${counts.ready === 1 ? "" : "s"} ready, ${counts.needs_review} to review, ${counts.duplicate} duplicate${counts.duplicate === 1 ? "" : "s"}, ${counts.invalid} invalid.`,
  };
}

export function commitRotaPreview(state, preview, { confirmed, idempotencyKey }) {
  if (!preview?.ok || !preview.planId) {
    return { state, result: { ok: false, code: "IMPORT_PLAN_NOT_FOUND" } };
  }
  if (confirmed !== true) {
    return {
      state,
      result: {
        ok: false,
        code: "CONFIRMATION_REQUIRED",
        plan_id: preview.planId,
        preview: `Import ${preview.counts.ready} reviewed ${preview.person} shift${preview.counts.ready === 1 ? "" : "s"}.`,
      },
    };
  }
  if (!idempotencyKey || String(idempotencyKey).length < 4) {
    return { state, result: { ok: false, code: "INVALID_IDEMPOTENCY_KEY" } };
  }

  const previousPlanId = state.idempotency[idempotencyKey];
  if (previousPlanId) {
    if (previousPlanId !== preview.planId) {
      return { state, result: { ok: false, code: "IDEMPOTENCY_KEY_CONFLICT", existing_plan_id: previousPlanId } };
    }
    const existingImport = state.committedImports.find(item => item.planId === preview.planId);
    return { state, result: { ok: true, idempotent: true, import_id: existingImport.id, imported: existingImport.eventIds.length } };
  }
  if (state.revision !== preview.baseRevision) {
    return { state, result: { ok: false, code: "IMPORT_PLAN_STALE", current_revision: state.revision } };
  }
  if (!preview.canCommit) {
    return { state, result: { ok: false, code: "IMPORT_REVIEW_REQUIRED", counts: preview.counts } };
  }

  const readyRows = preview.rows.filter(row => row.status === "ready");
  const events = readyRows.map(row => ({
    id: `shift-${stableHash(`${preview.planId}|${row.sourceRowId}`)}`,
    type: "shift",
    source: "rota_scan",
    sourcePlanId: preview.planId,
    person: row.person,
    date: row.date,
    start: row.start,
    endDate: row.endDate,
    end: row.end,
    overnight: row.overnight,
    label: row.label,
  }));
  const importRecord = {
    id: `rota-import-${stableHash(`${preview.planId}|${idempotencyKey}`)}`,
    planId: preview.planId,
    person: preview.person,
    eventIds: events.map(event => event.id),
  };
  const next = {
    ...state,
    revision: state.revision + 1,
    scheduleEvents: [...state.scheduleEvents, ...events],
    committedImports: [...state.committedImports, importRecord],
    idempotency: { ...state.idempotency, [idempotencyKey]: preview.planId },
  };
  return {
    state: next,
    result: {
      ok: true,
      import_id: importRecord.id,
      imported: events.length,
      event_ids: importRecord.eventIds,
      skipped_duplicates: preview.counts.duplicate,
      new_revision: next.revision,
    },
  };
}
