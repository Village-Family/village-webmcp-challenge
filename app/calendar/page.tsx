const days = [
  { label: "Mon", date: "14" },
  { label: "Tue", date: "15" },
  { label: "Wed", date: "16", active: true },
  { label: "Thu", date: "17" },
  { label: "Fri", date: "18" },
  { label: "Sat", date: "19" },
  { label: "Sun", date: "20" },
];

const events = [
  { top: 92, left: "8%", width: "28%", height: 145, title: "John", detail: "Early shift\n06:00–14:00", bg: "#e7e9ff", border: "#c6c8f6" },
  { top: 130, left: "37%", width: "28%", height: 168, title: "Childcare", detail: "Anne\n07:30–15:30", bg: "#fff0da", border: "#f0d3a9" },
  { top: 74, left: "66%", width: "26%", height: 183, title: "Tash", detail: "Late shift\n09:00–17:00", bg: "#daf1e5", border: "#b9dec9" },
  { top: 300, left: "66%", width: "26%", height: 96, title: "John", detail: "Night shift\n20:00–08:00", bg: "#ece7f8", border: "#d3c7ec" },
];

export default function CalendarPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "#f8faf8", color: "#17251f", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", paddingBottom: "calc(92px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "max(18px, env(safe-area-inset-top)) 16px 24px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <p style={{ margin: 0, color: "#738078", fontSize: 13, fontWeight: 700 }}>SEPTEMBER 2026</p>
            <h1 style={{ margin: "3px 0 0", fontSize: 30 }}>Calendar</h1>
          </div>
          <button type="button" disabled style={{ width: 42, height: 42, borderRadius: 14, border: "1px solid #dce5df", background: "white", fontSize: 22, color: "#547361", opacity: .7 }}>+</button>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 12 }}>
          {days.map((day) => (
            <div key={day.label} style={{ textAlign: "center", padding: "8px 2px", borderRadius: 14, background: day.active ? "#5f8f72" : "transparent", color: day.active ? "white" : "#526158" }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{day.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{day.date}</div>
            </div>
          ))}
        </div>

        <section style={{ background: "white", border: "1px solid #dce5df", borderRadius: 22, padding: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Wednesday 16 September</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#728079" }}>Your household at a glance</p>
            </div>
            <span style={{ background: "#edf5ef", color: "#4f7c62", borderRadius: 999, padding: "6px 9px", fontSize: 12, fontWeight: 800 }}>Covered</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateRows: "repeat(8, 52px)", fontSize: 11, color: "#859087", paddingTop: 2 }}>
              {["06:00","08:00","10:00","12:00","14:00","16:00","18:00","20:00"].map((t) => <div key={t}>{t}</div>)}
            </div>
            <div style={{ position: "relative", height: 416, backgroundImage: "linear-gradient(#edf1ee 1px, transparent 1px)", backgroundSize: "100% 52px", borderLeft: "1px solid #edf1ee" }}>
              {events.map((event) => (
                <div key={`${event.title}-${event.top}`} style={{ position: "absolute", top: event.top, left: event.left, width: event.width, height: event.height, padding: 9, borderRadius: 12, background: event.bg, border: `1px solid ${event.border}`, boxSizing: "border-box", whiteSpace: "pre-line", overflow: "hidden" }}>
                  <strong style={{ display: "block", fontSize: 13 }}>{event.title}</strong>
                  <span style={{ fontSize: 11, lineHeight: 1.35, color: "#4d5b53" }}>{event.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div style={{ background: "#fff", border: "1px solid #dce5df", borderRadius: 18, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>Childcare coverage</strong>
                <p style={{ margin: "4px 0 0", color: "#6d7b73", fontSize: 13 }}>Anne covers the overlap between both shifts.</p>
              </div>
              <span aria-hidden="true">✓</span>
            </div>
          </div>
          <div style={{ background: "#fff7ec", border: "1px solid #f0ddbd", borderRadius: 18, padding: 14 }}>
            <strong>Potential gap tomorrow</strong>
            <p style={{ margin: "4px 0 0", color: "#76634b", fontSize: 13 }}>17:00–18:30 has no confirmed cover yet.</p>
          </div>
        </section>
      </div>

      <nav aria-label="Primary" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 0, width: "min(100%, 560px)", boxSizing: "border-box", background: "rgba(255,255,255,.96)", borderTop: "1px solid #dfe7e2", padding: "9px 10px calc(9px + env(safe-area-inset-bottom))", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", zIndex: 20 }}>
        {["Home","Calendar","Village","Requests","You"].map((item) => <div key={item} style={{ textAlign: "center", fontSize: 11, fontWeight: item === "Calendar" ? 800 : 650, color: item === "Calendar" ? "#4f7c62" : "#7c8881" }}>{item}</div>)}
      </nav>
    </main>
  );
}
