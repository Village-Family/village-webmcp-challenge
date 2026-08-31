"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Check, ChevronRight, Circle, Clock3, HeartHandshake, Plus,
  RotateCcw, ShieldCheck, Sparkles, TimerReset, Users, X,
} from "lucide-react";
import { carers, createInitialState, previewRelay, transition } from "@/lib/village-engine.mjs";
import { createRotaWebMcpTools } from "@/lib/rota-webmcp-tools.mjs";
import { createShiftPatternWebMcpTools } from "@/lib/shift-pattern-webmcp-tools.mjs";
import { buildFamilyScheduleSnapshot } from "@/lib/family-schedule-engine.mjs";

type Stage = "clear" | "gap" | "relay" | "covered";
type Activity = {
  id: string; actor: string; text: string; time: string;
  tone: "human" | "agent" | "carer";
};
type RelayStep = {
  carerId: string; name: string;
  status: "queued" | "active" | "accepted" | "declined" | "timed_out" | "not_contacted";
  requestId: string;
};
type DemoState = {
  stage: Stage; overtimeAdded: boolean; activity: Activity[];
  coveredBy: string | null; processedResponseIds: string[];
  relay: null | {
    id: string; planId: string; status: "active" | "covered" | "exhausted";
    responseWindowMinutes: number; currentStepIndex: number | null;
    idempotencyKey: string; steps: RelayStep[];
  };
};
type Tool = {
  name: string; title?: string; description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => Promise<void>;
    };
  }
}

const days = [
  { day: "Mon", date: "31", iso: "2026-08-31", events: [] },
  { day: "Tue", date: "1", iso: "2026-09-01", events: [], active: true },
  { day: "Wed", date: "2", iso: "2026-09-02", events: [["School · 09:00", "school"]] },
  { day: "Thu", date: "3", iso: "2026-09-03", events: [["John · Rest day", "rest"]] },
  { day: "Fri", date: "4", iso: "2026-09-04", events: [] },
  { day: "Sat", date: "5", iso: "2026-09-05", events: [] },
  { day: "Sun", date: "6", iso: "2026-09-06", events: [] },
];

const tashSixOnFourOff = {
  id: "pattern-6f3a9c21", person: "Tash", startDate: "2026-08-29", endDate: null,
  sequence: ["early", "early", "late", "late", "night", "night", "off", "off", "off", "off"],
  definitions: {
    early: { code: "early", label: "Early", start: "06:00", end: "14:00" },
    late: { code: "late", label: "Late", start: "14:00", end: "22:00" },
    night: { code: "night", label: "Night", start: "22:00", end: "06:00" },
  },
  timezone: "Europe/London", status: "active",
};

function buildDemoSchedule(overtimeAdded: boolean, importedShifts: Record<string, unknown>[] = [], patterns: Record<string, unknown>[] = [tashSixOnFourOff]) {
  return buildFamilyScheduleSnapshot({
    patterns, importedShifts,
    manualEvents: [
      {
        id: "john-day-mon", person: "John", type: "shift", label: "Day",
        source: "manual", date: "2026-08-31", start: "08:00", end: "16:00",
      },
      ...(overtimeAdded ? [{
        id: "event-overtime-1", person: "John", type: "overtime", label: "OT",
        source: "manual", date: "2026-09-01", start: "16:00", end: "22:00",
      }] : []),
    ],
    careWindows: [{
      id: "after-school-tue", gapId: "gap-tue-1", date: "2026-09-01", start: "15:15", end: "18:30",
      children: ["Ida", "Arlo"], timezone: "Europe/London",
    }],
    guardians: ["John", "Tash"], from: "2026-08-31", to: "2026-09-06",
  });
}
export default function Home() {
  const [demo, setDemo] = useState<DemoState>(() => createInitialState());
  const scheduleStoreRef = useRef({ revision: 0, importedShifts: [] as Record<string, unknown>[], patterns: [tashSixOnFourOff] as Record<string, unknown>[] });
  const [scheduleVersion, setScheduleVersion] = useState(0);
  const stateRef = useRef(demo);
  useEffect(() => { stateRef.current = demo; }, [demo]);
  const familySchedule = useMemo(() => buildDemoSchedule(
    demo.overtimeAdded, scheduleStoreRef.current.importedShifts, scheduleStoreRef.current.patterns,
  ), [demo.overtimeAdded, scheduleVersion]);

  const applyAction = (action: Record<string, unknown>) => {
    const outcome = transition(stateRef.current, action);
    stateRef.current = outcome.state;
    setDemo(outcome.state);
    return outcome.result;
  };
  const addOvertime = () => applyAction({ type: "ADD_OVERTIME" });
  const startRelay = () => applyAction({
    type: "COMMIT_RELAY",
    orderedCarerIds: ["carer-anne", "carer-grandad", "carer-claire"],
    responseWindowMinutes: 15,
    idempotencyKey: "demo-relay-1",
  });
  const recordResponse = (requestId: string, response: "accepted" | "declined" | "timed_out") =>
    applyAction({ type: "RECORD_RESPONSE", requestId, response, responseId: `${requestId}-${response}` });
  const resetDemo = () => applyAction({ type: "RESET" });

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const controller = new AbortController();
    const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
      type: "object", additionalProperties: false, properties, required,
    });
    // WebMCP registrations are asynchronous. Queue them deliberately: firing
    // every registration at once can leave the browser with only the first
    // tool even though every call exists in source.
    let registrationQueue: Promise<void | undefined> = Promise.resolve();
    const register = (tool: Tool) => {
      registrationQueue = registrationQueue.then(() => document.modelContext
        ?.registerTool(tool, { signal: controller.signal })).catch(() => undefined);
      return registrationQueue;
    };

    void register({
      name: "get_family_briefing", title: "Get family briefing",
      description: "Return a calm, read-only briefing of what changed, the next family shifts and any childcare issue needing attention.",
      annotations: { readOnlyHint: true }, inputSchema: schema({}),
      execute: async () => {
        const snapshot = buildDemoSchedule(
          stateRef.current.overtimeAdded,
          scheduleStoreRef.current.importedShifts,
          scheduleStoreRef.current.patterns,
        );
        const unresolved = stateRef.current.stage === "covered" ? [] : snapshot.coverage.gaps;
        return {
          headline: unresolved.length ? "One childcare gap needs attention" : "Your village is in sync",
          needs_attention: unresolved,
          next_shifts: snapshot.schedule.events.filter((event: { date: string }) => event.date >= "2026-09-01").slice(0, 3),
          recent_changes: stateRef.current.activity.slice(0, 3),
          suggestion: unresolved.length ? "Preview a bounded Village Relay." : "No action needed.",
        };
      },
    });

    void register({
      name: "get_family_schedule", title: "Get family schedule",
      description: "Read the demo household schedule for 31 August to 6 September 2026, including parent shifts and confirmed childcare. Never changes data.",
      annotations: { readOnlyHint: true }, inputSchema: schema({}),
      execute: async () => {
        const snapshot = buildDemoSchedule(
          stateRef.current.overtimeAdded,
          scheduleStoreRef.current.importedShifts,
          scheduleStoreRef.current.patterns,
        );
        return {
          household_id: "demo-household", timezone: "Europe/London",
          children: ["Ida", "Arlo"], schedule: snapshot.schedule,
          childcare_gaps: snapshot.coverage.gaps,
          childcare_status: stateRef.current.stage === "covered"
            ? `covered_by_${stateRef.current.coveredBy?.toLowerCase()}`
            : stateRef.current.relay?.status ?? (snapshot.coverage.gapFound ? "uncovered" : "clear"),
        };
      },
    });
    void register({
      name: "add_overtime", title: "Add overtime",
      description: "Add John's overtime to the shared calendar. Changes family state. Call with confirmed=false to preview; only call with confirmed=true after John explicitly approves.",
      inputSchema: schema({
        date: { type: "string", enum: ["2026-09-01"] },
        start: { type: "string", enum: ["16:00"] },
        end: { type: "string", enum: ["22:00"] },
        confirmed: { type: "boolean", description: "True only after explicit human confirmation." },
      }, ["date", "start", "end", "confirmed"]),
      execute: async ({ confirmed }) => {
        if (stateRef.current.overtimeAdded) return {
          ok: true, idempotent: true, event_id: "event-overtime-1",
        };
        if (confirmed !== true) return {
          ok: false, code: "CONFIRMATION_REQUIRED",
          preview: "Add John's overtime on Tue 1 Sep, 16:00–22:00",
        };
        addOvertime();
        return { ok: true, event_id: "event-overtime-1", next_step: "Check childcare." };
      },
    });
    void register({
      name: "detect_childcare_gap", title: "Detect childcare gap",
      description: "Compare both parents' recorded commitments to check whether Ida and Arlo need childcare on Tuesday 1 September. Analysis only.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({ date: { type: "string", enum: ["2026-09-01"] } }, ["date"]),
      execute: async () => {
        const snapshot = buildDemoSchedule(
          stateRef.current.overtimeAdded,
          scheduleStoreRef.current.importedShifts,
          scheduleStoreRef.current.patterns,
        );
        const gap = snapshot.coverage.gaps[0] ?? null;
        return {
          gap_found: Boolean(gap) && stateRef.current.stage !== "covered",
          gap_id: gap?.id ?? null,
          window: gap ? { start: gap.start, end: gap.end } : null,
          reason: gap?.reason ?? "No overlapping parent commitments.",
          source_event_ids: gap?.causeEventIds ?? [], relay_ready: Boolean(gap),
        };
      },
    });
    void register({
      name: "find_available_carers", title: "Find available carers",
      description: "Find trusted carers whose recorded availability covers a childcare gap. Returns no contact details and never changes data.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({ gap_id: { type: "string", enum: ["gap-tue-1"] } }, ["gap_id"]),
      execute: async () => ({
        gap_id: "gap-tue-1",
        carers: carers.map((carer, rank) => ({
          carer_id: carer.id, name: carer.name, relationship: carer.relationship,
          available: carer.available, suitability_rank: rank + 1,
          window: { start: "15:30", end: "19:00" },
        })),
      }),
    });
    void register({
      name: "preview_coverage_relay", title: "Preview Village Relay",
      description: "Build a read-only sequential childcare request plan. Validates trusted carers, order and response window. Never contacts anyone.",
      annotations: { readOnlyHint: true },
      inputSchema: schema({
        gap_id: { type: "string", enum: ["gap-tue-1"] },
        ordered_carer_ids: {
          type: "array", minItems: 1, uniqueItems: true,
          items: { type: "string", enum: ["carer-anne", "carer-grandad", "carer-claire"] },
        },
        response_window_minutes: { type: "integer", minimum: 5, maximum: 60 },
      }, ["gap_id", "ordered_carer_ids", "response_window_minutes"]),
      execute: async ({ ordered_carer_ids, response_window_minutes }) =>
        previewRelay(
          stateRef.current,
          ordered_carer_ids as string[],
          response_window_minutes as number,
        ),
    });
    void register({
      name: "commit_coverage_relay", title: "Start Village Relay",
      description: "Start one approved sequential request Relay. Contacts only one trusted carer at a time and stops on acceptance. Call with confirmed=false to preview the consent boundary; only call with confirmed=true after John approves the entire named order and response window.",
      inputSchema: schema({
        relay_plan_id: { type: "string", enum: ["relay-plan-tue-1"] },
        ordered_carer_ids: {
          type: "array", minItems: 1, uniqueItems: true,
          items: { type: "string", enum: ["carer-anne", "carer-grandad", "carer-claire"] },
        },
        response_window_minutes: { type: "integer", minimum: 5, maximum: 60 },
        idempotency_key: { type: "string", minLength: 4 },
        confirmed: { type: "boolean", description: "True only after John approves the full Relay." },
      }, ["relay_plan_id", "ordered_carer_ids", "response_window_minutes", "idempotency_key", "confirmed"]),
      execute: async ({ ordered_carer_ids, response_window_minutes, idempotency_key, confirmed }) => {
        if (confirmed !== true) {
          const names = (ordered_carer_ids as string[])
            .map(id => carers.find(carer => carer.id === id)?.name ?? id)
            .join(", then ");
          return {
            ok: false, code: "CONFIRMATION_REQUIRED",
            preview: `Start a sequential Relay: ${names}; wait ${response_window_minutes} minutes per person; stop immediately on acceptance.`,
          };
        }
        return applyAction({
          type: "COMMIT_RELAY",
          orderedCarerIds: ordered_carer_ids as string[],
          responseWindowMinutes: response_window_minutes as number,
          idempotencyKey: idempotency_key as string,
        });
      },
    });
    void register({
      name: "record_childcare_response", title: "Record carer response",
      description: "Record the active carer's stated response. A decline or timeout advances exactly once inside the approved Relay; an acceptance stops the Relay and updates the shared calendar.",
      inputSchema: schema({
        request_id: { type: "string", enum: ["request-anne-1", "request-grandad-1", "request-claire-1"] },
        response: { type: "string", enum: ["accepted", "declined", "timed_out"] },
        response_id: { type: "string", minLength: 4, description: "Stable source event ID for duplicate-safe handling." },
      }, ["request_id", "response", "response_id"]),
      execute: async ({ request_id, response, response_id }) => applyAction({
        type: "RECORD_RESPONSE",
        requestId: request_id,
        response,
        responseId: response_id,
      }),
    });
    void register({
      name: "get_village_status", title: "Get Village status",
      description: "Summarise current overtime, gap, request and childcare coverage. Never changes data.",
      annotations: { readOnlyHint: true }, inputSchema: schema({}),
      execute: async () => ({
        overtime_added: stateRef.current.overtimeAdded,
        workflow_stage: stateRef.current.stage,
        relay: stateRef.current.relay,
        childcare: stateRef.current.stage === "covered"
          ? { status: "covered", carer: stateRef.current.coveredBy, start: "16:00", end: "18:30" }
          : { status: stateRef.current.stage },
      }),
    });
    void register({
      name: "reset_village_demo", title: "Reset Village demo",
      description: "Reset only this fictional challenge demo. Removes demo actions, so use only after an explicit request to reset.",
      inputSchema: schema({ confirmed: { type: "boolean" } }, ["confirmed"]),
      execute: async ({ confirmed }) => {
        if (confirmed !== true) return {
          ok: false, code: "CONFIRMATION_REQUIRED",
          preview: "Reset the demo: clears overtime, any Relay, coverage and activity history back to the seeded Tuesday.",
        };
        return applyAction({ type: "RESET" });
      },
    });
    const sharedRevision = () => scheduleStoreRef.current.revision;
    const rotaAdapter = createRotaWebMcpTools({
      householdMembers: ["John", "Tash"],
      getHouseholdRevision: sharedRevision,
      onStateChange: state => {
        scheduleStoreRef.current = {
          ...scheduleStoreRef.current,
          revision: state.revision,
          importedShifts: state.scheduleEvents.filter((event: { source?: string }) => event.source === "rota_scan"),
        };
        setScheduleVersion(version => version + 1);
      },
    });
    for (const rotaTool of rotaAdapter.tools) {
      void register(rotaTool as Tool);
    }

    const patternAdapter = createShiftPatternWebMcpTools({
      householdMembers: ["John", "Tash"],
      initialPatterns: scheduleStoreRef.current.patterns,
      getHouseholdRevision: sharedRevision,
      onStateChange: state => {
        scheduleStoreRef.current = { ...scheduleStoreRef.current, revision: state.revision, patterns: state.patterns };
        setScheduleVersion(version => version + 1);
      },
    });
    for (const patternTool of patternAdapter.tools) {
      void register(patternTool as Tool);
    }

    return () => controller.abort();
  }, []);

  const status = useMemo(() => ({
    clear: ["Week looks clear", "clear"],
    gap: ["Childcare needed", "alert"],
    relay: ["Village Relay active", "waiting"],
    covered: ["Childcare covered", "covered"],
  }[demo.stage]), [demo.stage]);

  const notContacted = useMemo(
    () => demo.relay?.steps.filter(step => step.status === "not_contacted").map(step => step.name) ?? [],
    [demo.relay],
  );
  const nextShifts = useMemo(
    () => familySchedule.schedule.events.filter((event: { date: string }) => event.date >= "2026-09-01").slice(0, 3),
    [familySchedule],
  );
  const unresolvedGap = demo.stage === "covered" ? null : familySchedule.coverage.gaps[0] ?? null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark"><HeartHandshake size={22} /></span><span>Village</span>
        </a>
        <nav className="desktop-nav">
          <a className="active" href="#week">Calendar</a><a href="#care">Childcare</a><a href="#activity">Activity</a>
        </nav>
        <div className="profile-cluster">
          <button className="icon-button" aria-label="Notifications"><Bell size={19} /></button>
          <span className="avatar john">J</span><span className="profile-name">John</span>
        </div>
      </header>

      <div className="page" id="top">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">Your family, in sync</p>
            <h1>Morning, John.</h1>
            <p>Here’s what the village looks like this week.</p>
          </div>
          <button className="primary-button" onClick={addOvertime} disabled={demo.overtimeAdded}>
            {demo.overtimeAdded ? <Check size={18} /> : <Plus size={18} />}
            {demo.overtimeAdded ? "Overtime added" : "Add overtime"}
          </button>
        </section>

        <section className="family-briefing" aria-label="Family briefing">
          <div className="briefing-lead">
            <span className="section-kicker">Village briefing</span>
            <strong>{unresolvedGap ? "One thing needs sorting" : "Everyone is in sync"}</strong>
            <p>{unresolvedGap ? `Childcare is uncovered ${unresolvedGap.start}–${unresolvedGap.end}.` : "Nothing urgent. We’ll surface changes here."}</p>
          </div>
          <div className="briefing-shifts">
            {nextShifts.map((shift: { id: string; person: string; label: string; date: string; start: string }) => (
              <span key={shift.id}><i className={`dot ${shift.person.toLowerCase()}-dot`} /> {shift.person} · {shift.label} <small>{shift.date.slice(5)} {shift.start}</small></span>
            ))}
          </div>
          <span className={`briefing-action ${unresolvedGap ? "attention" : "settled"}`}>
            {unresolvedGap ? "Action needed" : "No action needed"}
          </span>
        </section>

        <section className={`status-card ${status[1]}`} aria-live="polite">
          <div className="status-icon">
            {demo.stage === "covered" ? <ShieldCheck size={25} /> : demo.stage === "clear" ? <Sparkles size={25} /> : <Users size={25} />}
          </div>
          <div className="status-copy">
            <span>Tuesday 1 September</span><strong>{status[0]}</strong>
            <p>
              {demo.stage === "clear" && "John is free while Tash works her late shift."}
              {demo.stage === "gap" && "John and Tash overlap from 16:00. Ida and Arlo need someone until 18:30."}
              {demo.stage === "relay" && `${demo.relay?.steps[demo.relay.currentStepIndex ?? 0]?.name} has the only active request. The next person is contacted only after a decline or timeout.`}
              {demo.stage === "covered" && `${demo.coveredBy} has it. Ida and Arlo are covered from 16:00 to 18:30; everyone after them was left undisturbed.`}
            </p>
          </div>
          {demo.stage === "gap" && <button className="status-action" onClick={startRelay}>Approve Village Relay <ChevronRight size={17} /></button>}
          {demo.stage === "relay" && demo.relay?.steps[demo.relay.currentStepIndex ?? 0]?.name === "Anne" && (
            <button className="status-action" onClick={() => recordResponse("request-anne-1", "declined")}>Demo: Anne declines <X size={17} /></button>
          )}
          {demo.stage === "relay" && demo.relay?.steps[demo.relay.currentStepIndex ?? 0]?.name === "Grandad" && (
            <button className="status-action" onClick={() => recordResponse("request-grandad-1", "accepted")}>Demo: Grandad accepts <Check size={17} /></button>
          )}
          {demo.stage === "covered" && (
            <div className="covered-pills">
              <span className="coverage-pill"><Check size={15} /> Confirmed</span>
              {notContacted.length > 0 && (
                <span className="privacy-pill">
                  <ShieldCheck size={15} /> {notContacted.join(", ")} — not contacted
                </span>
              )}
            </div>
          )}
        </section>

        {demo.relay && <RelayPanel relay={demo.relay} />}

        <section className="content-grid">
          <div className="calendar-card" id="week">
            <div className="section-heading">
              <div><span className="section-kicker">Family calendar</span><h2>31 Aug – 6 Sep</h2></div>
              <span className="legend"><i className="dot john-dot" /> John <i className="dot tash-dot" /> Tash <i className="dot care-dot" /> Care</span>
            </div>
            <div className="pattern-banner">
              <div><span className="pattern-badge">AUTO</span><strong>Tash · 6 on, 4 off</strong></div>
              <span>Early · Early · Late · Late · Night · Night · 4 off</span>
              <small>Repeats until stopped</small>
            </div>
            <div className="week-grid">
              {days.map(item => (
                <article className={`day ${item.active ? "selected" : ""}`} key={item.day}>
                  <div className="day-head"><span>{item.day}</span><strong>{item.date}</strong></div>
                  <div className="day-events">
                    {familySchedule.schedule.events
                      .filter((event: { date: string }) => event.date === item.iso)
                      .map((event: { id: string; person: string; label: string; start: string; end: string; source: string }) => (
                        <span className={`event ${event.person.toLowerCase()}`} key={event.id}>
                          {event.person} · {event.label} {event.start.slice(0, 2)}–{event.end.slice(0, 2)}
                          {event.source === "shift_pattern" && <i className="repeat-mark" title="From repeating pattern">↻</i>}
                        </span>
                      ))}
                    {item.events.map(event => <span className={`event ${event[1]}`} key={event[0]}>{event[0]}</span>)}
                    {item.day === "Tue" && demo.stage === "covered" && <span className="event care">{demo.coveredBy} · Care 16–18:30</span>}
                    {!item.events.length && !familySchedule.schedule.events.some((event: { date: string }) => event.date === item.iso) && <span className="empty-day">Nothing planned</span>}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="care-card" id="care">
            <div className="section-heading compact">
              <div><span className="section-kicker">Trusted carers</span><h2>Your village</h2></div>
              <span className="count-pill">3 people</span>
            </div>
            <div className="carer-list">
              <Carer initial="A" name="Anne" detail="Grandparent · Available Tue" className="anne" state="available" />
              <Carer initial="G" name="Grandad" detail="Grandparent · Available Tue" className="grandad" state="available" />
              <Carer initial="C" name="Claire" detail="Auntie · Available if needed" className="claire" state="maybe" />
            </div>
            <div className="privacy-note"><ShieldCheck size={17} /><span>Availability stays inside your invited village.</span></div>
          </aside>
        </section>

        <section className="activity-card" id="activity">
          <div className="section-heading compact">
            <div><span className="section-kicker">Shared history</span><h2>Latest activity</h2></div>
            {demo.stage !== "clear" && <button className="reset-button" onClick={resetDemo}><RotateCcw size={15} /> Reset demo</button>}
          </div>
          <div className="timeline">
            {demo.activity.map(item => (
              <div className="timeline-row" key={item.id}>
                <span className={`timeline-icon ${item.tone}`}>
                  {item.tone === "agent" ? <Sparkles size={16} /> : item.tone === "carer" ? <HeartHandshake size={16} /> : <Clock3 size={16} />}
                </span>
                <div><strong>{item.actor}</strong><p>{item.text}</p></div><time>{item.time}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
      <footer className="challenge-strip">
        <span><Sparkles size={15} /> WebMCP-enabled</span>
        <p>Ask: “Sort Tuesday childcare. Try Anne, then Grandad, then Claire—without messaging everyone at once.”</p>
      </footer>
    </main>
  );
}

function RelayPanel({ relay }: { relay: NonNullable<DemoState["relay"]> }) {
  const label = relay.status === "covered" ? "Covered" : relay.status === "exhausted" ? "Still uncovered" : "Relay active";
  return (
    <section className={`relay-card ${relay.status}`} aria-live="polite">
      <div className="relay-heading">
        <div>
          <span className="section-kicker">Bounded agent autonomy</span>
          <h2>Village Relay</h2>
          <p>One approved chain. One active request. Stops the instant someone accepts.</p>
        </div>
        <span className="relay-status"><TimerReset size={15} /> {label}</span>
      </div>
      <div className="relay-chain">
        {relay.steps.map((step, index) => (
          <div className={`relay-step ${step.status}`} key={step.carerId}>
            <span className="relay-index">
              {step.status === "accepted" ? <Check size={16} />
                : step.status === "declined" ? <X size={16} />
                : step.status === "not_contacted" ? <ShieldCheck size={14} />
                : <Circle size={13} />}
            </span>
            <div className="relay-person">
              <span className={`avatar ${step.name.toLowerCase()}`}>{step.name.slice(0, 1)}</span>
              <div><strong>{step.name}</strong><span>{relayStepLabel(step.status, relay.responseWindowMinutes)}</span></div>
            </div>
            {index < relay.steps.length - 1 && <ChevronRight className="relay-arrow" size={18} />}
          </div>
        ))}
      </div>
      <div className="relay-rule"><ShieldCheck size={16} /> Later carers remain uncontacted unless the active request declines or times out.</div>
    </section>
  );
}

function relayStepLabel(status: RelayStep["status"], windowMinutes: number) {
  return {
    queued: "Waiting respectfully",
    active: `Asked · ${windowMinutes} min window`,
    accepted: "Accepted · relay stopped",
    declined: "Declined",
    timed_out: "No response",
    not_contacted: "Not contacted",
  }[status];
}

function Carer({ initial, name, detail, className, state }: {
  initial: string; name: string; detail: string; className: string; state: string;
}) {
  return <div className="carer-row"><span className={`avatar ${className}`}>{initial}</span><div><strong>{name}</strong><span>{detail}</span></div><i className={`availability ${state}`} /></div>;
}
