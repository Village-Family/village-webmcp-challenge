import Link from "next/link";

const steps = [
  {
    title: "Create your household",
    text: "Set up the family space that keeps shifts, childcare and real-life changes in one place.",
  },
  {
    title: "Invite your village",
    text: "Add your partner, grandparents, aunties, uncles or trusted carers with the right level of access.",
  },
  {
    title: "Add your shifts",
    text: "Start manually, use a repeating pattern, or later scan a rota photo and approve what Village finds.",
  },
  {
    title: "Let Village coordinate",
    text: "Spot childcare gaps, ask the right people in order, and keep everyone updated without another WhatsApp scramble.",
  },
];

export default function WelcomePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: "max(24px, env(safe-area-inset-top)) 20px max(32px, env(safe-area-inset-bottom))",
        background: "#f7faf7",
        color: "#183026",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div
          aria-hidden="true"
          style={{
            width: 58,
            height: 58,
            borderRadius: 18,
            display: "grid",
            placeItems: "center",
            background: "#dfeee3",
            color: "#4f7c62",
            fontSize: 30,
            fontWeight: 800,
            marginBottom: 24,
          }}
        >
          V
        </div>

        <p style={{ margin: 0, color: "#5f8f72", fontWeight: 700, letterSpacing: ".02em" }}>WELCOME TO VILLAGE</p>
        <h1 style={{ fontSize: "clamp(2.35rem, 10vw, 4rem)", lineHeight: 0.98, margin: "10px 0 16px" }}>
          Family life,
          <br />
          finally in one place.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.55, margin: "0 0 30px", color: "#496156" }}>
          Built for families whose work, childcare and plans do not fit neatly into a normal calendar.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {steps.map((step, index) => (
            <section
              key={step.title}
              style={{
                display: "grid",
                gridTemplateColumns: "42px 1fr",
                gap: 14,
                padding: 16,
                border: "1px solid #dbe8de",
                borderRadius: 18,
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: "#edf5ef",
                  color: "#4f7c62",
                  fontWeight: 800,
                }}
              >
                {index + 1}
              </div>
              <div>
                <h2 style={{ fontSize: 17, margin: "1px 0 5px" }}>{step.title}</h2>
                <p style={{ margin: 0, lineHeight: 1.5, color: "#607267" }}>{step.text}</p>
              </div>
            </section>
          ))}
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
          <button
            type="button"
            disabled
            aria-describedby="setup-note"
            style={{
              border: 0,
              borderRadius: 16,
              padding: "16px 18px",
              background: "#5f8f72",
              color: "white",
              fontSize: 17,
              fontWeight: 750,
              opacity: 0.72,
            }}
          >
            Create my household
          </button>
          <p id="setup-note" style={{ margin: 0, textAlign: "center", fontSize: 13, color: "#718078" }}>
            Account creation will switch on when the Village Supabase project is connected.
          </p>
          <Link href="/" style={{ textAlign: "center", padding: 12, color: "#4f7c62", fontWeight: 700 }}>
            View the current Village demo
          </Link>
        </div>
      </div>
    </main>
  );
}
