# Scenario 3: Home Burst Pipe — Urgent Make-Safe and Kitchen Repair

## Flavor

A home insurance claim that needs urgent triage, emergency make-safe, and supplier coordination across a plumber and a builder. Showcases vulnerability awareness, temporary accommodation logic, and proactive customer communication during a stressful event.

## Customer

**Michael Harris** — Home Insurance Customer

- Family home with two young children
- Stressed and practical
- Worried about whether water damage is covered and how soon repairs can start

## Incident

A flexible hose under Michael's kitchen sink burst overnight. By morning the kitchen floor, kickboards, and lower cabinetry are saturated. Water has tracked into the laundry, and the kitchen is unusable. The family cannot prepare meals at home.

---

## Claim Journey

### 1. First Notice of Loss — Claims Intake AI Agent

- Michael calls the claims hotline. The **Claims Intake AI Agent** assists the human officer in real time.
- It captures: incident time, cause (burst flexi hose), affected rooms, and confirms the water has been **shut off at the mains**.
- It detects keywords like "two children", "no kitchen", and "water still pooling" → **flags the claim as urgent and the household as potentially vulnerable**.
- It generates a tailored checklist: photos, plumber's report on the failed hose, and a list of damaged items.
- It lodges claim `CLM-2026-00307` and creates an **emergency make-safe task**.

> Sarah confirms the lodgement and reassures Michael that an emergency plumber will be dispatched.

---

### 2. Emergency Make-Safe — Supplier Coordination AI Agent

- The **Supplier Coordination AI Agent** assigns an **after-hours emergency plumber** within 30 minutes of lodgement.
- It books a **water extraction and drying company** for the same day.
- It notifies Michael by SMS with the plumber's name, ETA, and a job reference.
- It pre-authorises the make-safe scope up to the policy's emergency limit so Michael does not pay out of pocket.

---

### 3. Coverage Check — Claims Assessment AI Agent

- The **Claims Assessment AI Agent** reviews the policy.
- "Sudden and accidental escape of liquid" is covered. Gradual leakage is not.
- It checks the plumber's report: **"flexi hose ruptured at the crimp; failure was sudden"** — supports cover.
- It confirms **temporary accommodation** is available under the policy if the home becomes uninhabitable. Since the kitchen is unusable but the home is otherwise habitable, it instead authorises **meal allowance and laundromat costs** for up to 14 days.
- It produces a structured assessment: cover confirmed, reserves recommended at $18,000.

> Daniel reviews the recommendation and accepts.

---

### 4. Damage Scope — Loss Adjusting AI Agent

- The **Loss Adjusting AI Agent** prepares an **inspection brief** for Priya:
  - Background: burst flexi hose, kitchen and laundry affected.
  - Key questions: signs of pre-existing rot, age of cabinetry, scope of laundry damage, moisture readings behind walls.
- During the site visit, Priya uploads photos and notes.
- The agent drafts a **damage scope**: replace lower cabinetry, kickboards, vinyl flooring across kitchen and laundry, repaint affected walls, and check the subfloor.
- Estimated cost band: `$14,000–$19,000`.

---

### 5. Builder Quote and Approval

- The **Supplier Coordination AI Agent** assigns an approved builder.
- Quote received: **$17,200**.
- The agent runs a **cost reasonableness check** against benchmarks → "Within range."
- The **Claims Assessment AI Agent** confirms the quote matches scope and authorises the work.
- Builder schedule: 8 working days.

---

### 6. Customer Communications — Customer Communications AI Agent

The **Customer Communications AI Agent** drives proactive updates because Michael is stressed:

- Day 0: Confirmation of claim, plumber dispatched, meal allowance approved.
- Day 1: Drying equipment installed, expected duration 4 days.
- Day 3: Builder appointed, quote in review.
- Day 5: Repair start date confirmed.
- Day 8: Daily progress note from the builder.
- Day 14: Repairs complete, final inspection booked.

The agent **adjusts tone** to be warm and reassuring, and avoids jargon. It also flags one period of silence (a 2-day gap during quoting) and prompts a status update before Michael has to chase.

---

### 7. Settlement — Settlement AI Agent

- Builder submits final invoice: $17,200.
- Plumber and drying invoices: $1,650 (make-safe).
- Meal allowance: $420.
- The **Settlement AI Agent** calculates:
  - Builder paid directly: `$17,200 − $500 excess = $16,700`.
  - Make-safe paid to suppliers: `$1,650`.
  - Meal allowance paid to Michael: `$420`.
- It validates payee details, confirms approval authority, and releases payments.

---

## AI Agents Featured

1. Claims Intake AI Agent (urgency triage, vulnerability)
2. Supplier Coordination AI Agent (emergency plumber, drying, builder)
3. Claims Assessment AI Agent (cover analysis, allowance)
4. Loss Adjusting AI Agent (inspection brief, scope drafting)
5. Customer Communications AI Agent (proactive empathetic updates)
6. Settlement AI Agent (multi-party payments)

## Demo Highlight

Shows how AI agents support an **urgent home claim** end-to-end: dispatching emergency suppliers within minutes, coordinating builders, keeping a stressed family informed, and handling multi-payee settlement cleanly.
