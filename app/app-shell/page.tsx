"use client";

import { CalendarDays, HeartHandshake, Home, Inbox, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

const tabs = [
  { id: "home", label: "Home", icon: Home },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "village", label: "Village", icon: HeartHandshake },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "you", label: "You", icon: UserRound },
] as const;

type TabId = (typeof tabs)[number]["id"];

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dfe9e1",
  borderRadius: 20,
  padding: 18,
  boxShadow: "0 8px 24px rgba(39, 67, 49, 0.05)",
} as const;

function HomeScreen() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={{ ...cardStyle, background: "#edf5ef" }}>
        <p style={{ margin: 0, color: "#678272", fontSize: 13, fontWeight: 800 }}>TODAY</p>
        <h2 style={{ margin: "6px 0 8px", fontSize: 25 }}>Your family is covered.</h2>
        <p style={{ margin: 0, color: "#587064", lineHeight: 1.5 }}>
          This becomes your calm daily briefing: shifts, childcare, pickups, changes and anything Village needs you to act on.
        </p>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, color: "#789084", fontSize: 13, fontWeight: 800 }}>NEXT UP</p>
            <h3 style={{ margin: "5px 0 3px", fontSize: 18 }}>No live household yet</h3>
            <p style={{ margin: 0, color: "#6b7b72", fontSize: 14 }}>Connect Supabase to add real shifts and childcare.</p>
          </div>
          <span aria-hidden="true" style={{ fontSize: 28 }}>✓</span>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <button type="button" disabled style={{ ...cardStyle, textAlign: "left", opacity: 0.7, minHeight: 124 }}>
          <strong style={{ display: "block", fontSize: 17, marginBottom: 7 }}>+ Overtime</strong>
          <span style={{ color: "#6f7f76", lineHeight: 1.4 }}>Add a shift and instantly check childcare impact.</span>
        </button>
        <button type="button" disabled style={{ ...cardStyle, textAlign: "left", opacity: 0.7, minHeight: 124 }}>
          <strong style={{ display: "block", fontSize: 17, marginBottom: 7 }}>Ask the Village</strong>
          <span style={{ color: "#6f7f76", lineHeight: 1.4 }}>Send one calm childcare request to the right people.</span>
        </button>
      </div>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section style={cardStyle}>
      <p style={{ margin: 0, color: "#789084", fontSize: 13, fontWeight: 800 }}>COMING INTO V1</p>
      <h2 style={{ margin: "7px 0 9px", fontSize: 26 }}>{title}</h2>
      <p style={{ margin: 0, color: "#607267", lineHeight: 1.55 }}>{body}</p>
    </section>
  );
}

export default function AppShellPage() {
  const [active, setActive] = useState<TabId>("home");

  const content = useMemo(() => {
    switch (active) {
      case "home":
        return <HomeScreen />;
      case "calendar":
        return <Placeholder title="Family Calendar" body="A shared view of shifts, overtime, school, appointments, lifts and childcare — designed around irregular family life rather than a standard office week." />;
      case "village":
        return <Placeholder title="Your Village" body="Invite your partner, grandparents, aunties, uncles and trusted carers, then control what each person can see and respond to." />;
      case "requests":
        return <Placeholder title="Requests" body="Childcare requests, Relay status and responses live here. One place to see who was asked, who replied and what still needs sorting." />;
      case "you":
        return <Placeholder title="You" body="Your shift pattern, notification preferences, connected calendars, household settings and privacy controls will live here." />;
    }
  }, [active]);

  return (
    <main style={{ minHeight: "100dvh", background: "#f7faf7", color: "#183026", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", minHeight: "100dvh", padding: "max(24px, env(safe-area-inset-top)) 18px calc(96px + env(safe-area-inset-bottom))" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div>
            <p style={{ margin: 0, color: "#6f8b79", fontWeight: 750, fontSize: 13 }}>VILLAGE</p>
            <h1 style={{ margin: "3px 0 0", fontSize: 28, lineHeight: 1.1 }}>Good evening</h1>
          </div>
          <div aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 16, display: "grid", placeItems: "center", background: "#dfeee3", color: "#4f7c62", fontWeight: 850, fontSize: 21 }}>V</div>
        </header>

        {content}
      </div>

      <nav aria-label="Primary" style={{ position: "fixed", left: 0, right: 0, bottom: 0, borderTop: "1px solid #dbe7dd", background: "rgba(255,255,255,0.96)", backdropFilter: "blur(18px)", padding: "8px 10px max(8px, env(safe-area-inset-bottom))", zIndex: 10 }}>
        <div style={{ maxWidth: 620, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const selected = active === id;
            return (
              <button key={id} type="button" onClick={() => setActive(id)} aria-current={selected ? "page" : undefined} style={{ border: 0, background: selected ? "#edf5ef" : "transparent", color: selected ? "#4f7c62" : "#7b8880", borderRadius: 14, minHeight: 58, padding: "7px 2px", display: "grid", justifyItems: "center", alignContent: "center", gap: 4, fontSize: 11, fontWeight: selected ? 800 : 650 }}>
                <Icon size={21} strokeWidth={selected ? 2.5 : 2} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
