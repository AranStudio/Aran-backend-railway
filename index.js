:root {
  --bg-dark: #05070e;
  --glass-white: rgba(255, 255, 255, 0.08);
  --glass-strong: rgba(255, 255, 255, 0.12);
  --glass-border: rgba(255, 255, 255, 0.18);

  --neon-blue: #8fd4ff;
  --neon-blue-soft: rgba(143, 212, 255, 0.35);

  --text-main: rgba(255, 255, 255, 0.92);
  --text-muted: rgba(255, 255, 255, 0.6);

  --radius-lg: 26px;
  --radius-md: 18px;

  --blur: blur(18px);

  --shadow-lg: 0 30px 80px rgba(0,0,0,0.65);
  --shadow-soft: 0 12px 40px rgba(0,0,0,0.45);

  --font: "Josefin Sans", system-ui, sans-serif;
}

/* RESET */
* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  font-family: var(--font);
  background: radial-gradient(
      1200px 900px at 70% 10%,
      rgba(143,212,255,0.06),
      transparent 60%
    ),
    var(--bg-dark);
  color: var(--text-main);
}

/* =========================
   GLOBAL LAYOUT
   ========================= */

.aran-root {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.shell {
  width: 100%;
  max-width: 1100px;
  padding: 32px;
}

.shell-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* =========================
   PANELS (GLASS)
   ========================= */

.panel,
.card {
  background: linear-gradient(
    180deg,
    rgba(255,255,255,0.10),
    rgba(255,255,255,0.04)
  );
  backdrop-filter: var(--blur);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-lg);
}

.panel-inner,
.card {
  padding: 28px;
}

/* =========================
   HEADERS
   ========================= */

.header {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.aran-logo {
  display: flex;
  align-items: center;
  gap: 14px;
}

.aran-title {
  font-size: 24px;
  letter-spacing: 0.05em;
}

.aran-sub {
  font-size: 12px;
  letter-spacing: 0.22em;
  color: var(--text-muted);
}

/* =========================
   INPUTS — GLASS PROMPT
   ========================= */

textarea,
input,
select {
  width: 100%;
  background: linear-gradient(
    180deg,
    rgba(0,0,0,0.55),
    rgba(0,0,0,0.35)
  );
  color: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  padding: 16px;
  font-family: var(--font);
  font-size: 15px;
  backdrop-filter: blur(14px);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
}

textarea::placeholder {
  color: rgba(255,255,255,0.45);
}

/* ASK ANYTHING PROMPT LOOK */
.textarea {
  min-height: 150px;
  box-shadow:
    inset 0 0 20px rgba(143,212,255,0.08),
    0 0 40px rgba(143,212,255,0.06);
}

/* =========================
   DROPDOWN FIX (IMPORTANT)
   ========================= */

select {
  appearance: none;
  cursor: pointer;
}

select option {
  background: #0b0e18;
  color: white;
}

/* =========================
   BUTTONS — APPLE NEON GLASS
   ========================= */

.btn {
  border-radius: 999px;
  padding: 12px 22px;
  background: linear-gradient(
    180deg,
    rgba(255,255,255,0.20),
    rgba(255,255,255,0.08)
  );
  border: 1px solid var(--glass-border);
  color: white;
  cursor: pointer;
  backdrop-filter: blur(16px);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.08),
    0 10px 30px rgba(0,0,0,0.4);
  transition: all 0.2s ease;
}

.btn.neon {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.15),
    0 0 30px rgba(143,212,255,0.35),
    0 20px 50px rgba(0,0,0,0.6);
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow:
    0 0 40px rgba(143,212,255,0.45),
    0 24px 60px rgba(0,0,0,0.7);
}

.btn:active {
  transform: translateY(0);
}

/* =========================
   GRID / SPACING FIX
   ========================= */

.grid,
.anchor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .grid,
  .anchor-grid {
    grid-template-columns: 1fr;
  }
}

/* =========================
   HERO IMAGE
   ========================= */

.hero-img {
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-soft);
}

/* =========================
   LOADER (KEEP AS IS)
   ========================= */

.global-loader {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(12px);
  display: grid;
  place-items: center;
  z-index: 999;
}
