# Scenario 1: Motor Collision — Rear-End Accident

## Flavor

Motor insurance claim where the customer's car has been hit and needs repair. Showcases photo-based damage assessment, supplier (garage) coordination, rental car arrangement, and supplier payment.

## Customer

**Aisha Khan** — Motor Insurance Customer

- Drives daily for work
- Time-sensitive and direct
- Needs fast clarity on repair timeline and rental car

## Incident

Aisha was stopped at a red light when another driver rear-ended her sedan. The other driver admitted fault at the scene and exchanged details. Aisha's rear bumper is crushed, the boot does not close, and a rear tail light is broken. The car is drivable but unsafe at night.

---

## Claim Journey

### 1. First Notice of Loss — Claims Intake AI Agent

Aisha lodges the claim through the customer portal on her phone, still standing near the roadside.

- The **Claims Intake AI Agent** captures policy number, incident date, time, and location.
- It guides her through a dynamic questionnaire: other driver's name, registration, insurer, and whether police attended.
- It asks her to upload **photos of the damage, the other vehicle, and the scene**.
- It detects she relies on the car for work and **flags the claim as urgent** for rental priority.
- It generates a **document checklist**: driver's licence, other party details, photos, and (if available) a police event number.

**Handoff:** Claim is created with claim number `CLM-2026-00184` and routed to assessment.

> Sarah, the intake officer, reviews the agent's draft, confirms the third-party details, and releases the claim into the queue.

---

### 2. Coverage Check — Claims Assessment AI Agent

- The **Claims Assessment AI Agent** confirms Aisha holds Comprehensive Motor cover with a $750 excess.
- It checks for exclusions (e.g., unlicensed driver, undisclosed modifications) and finds none.
- It reviews the photos and matches them to the described rear-end impact.
- It recommends **third-party recovery** be pursued from the at-fault driver's insurer, so Aisha's excess can be refunded later.
- It produces a structured assessment note: "Cover confirmed. Damage consistent with statement. Approve repair, pursue recovery."

> Daniel, the assessor, accepts the recommendation with one click.

---

### 3. Photo Damage Triage — Loss Adjusting AI Agent

- The **Loss Adjusting AI Agent** analyses the uploaded photos.
- It tags the visible damage: **rear bumper (replace)**, **boot panel (repair/replace)**, **right tail light (replace)**, **possible rear chassis alignment (inspect)**.
- It produces a **draft damage scope** and an estimated repair band of `$3,800–$5,200`.
- It flags that a physical inspection at the repairer is needed to confirm chassis alignment.

> Priya, the loss adjuster, reviews the draft scope and forwards it to the chosen repairer.

---

### 4. Garage Assignment — Supplier Coordination AI Agent

- The **Supplier Coordination AI Agent** searches the preferred repairer network in Aisha's postcode.
- It ranks suppliers by availability, cycle time, and quality score.
- It assigns **"Northside Smash Repairs"** — available the next morning, 6-day average cycle.
- It books a **rental car** through the partnered hire provider for the duration of the repair.
- It sends Aisha SMS and email with the repairer's address, drop-off time, and rental pickup details.
- It sets SLA reminders: quote due in 48 hours, repair completion within 7 days.

---

### 5. Repair Quote and Approval

- The repairer submits a quote of **$4,800**.
- The **Supplier Coordination AI Agent** runs a **cost reasonableness check** against benchmarks for the same vehicle and damage pattern → "Within expected range."
- The **Claims Assessment AI Agent** confirms the quote matches the approved scope and authorises the work.

---

### 6. Settlement and Payment — Settlement AI Agent

- Repairs complete on day 6. The repairer uploads the final invoice.
- The **Settlement AI Agent** matches the invoice to the approved scope and quote.
- It calculates: `Approved $4,800 − $750 excess = $4,050 payable to repairer`.
- Aisha pays her excess directly to the repairer at pickup.
- The agent confirms the payment is within Daniel's authority limit, validates the repairer's bank details, and releases payment.
- It records a full audit trail of the calculation.

---

### 7. Excess Recovery

- The **Claims Assessment AI Agent** opens a **third-party recovery** sub-task against the at-fault driver's insurer.
- Once recovered, the **Settlement AI Agent** refunds Aisha's $750 excess automatically.

---

### 8. Customer Communications

Throughout the journey, the **Customer Communications AI Agent**:

- Sent a confirmation SMS at lodgement with the claim number.
- Sent a daily status update during repair.
- Drafted a plain-English explanation when third-party recovery began.
- Sent a final closure email with the repairer invoice, settlement summary, and a link to leave feedback.

---

## AI Agents Featured

1. Claims Intake AI Agent
2. Claims Assessment AI Agent
3. Loss Adjusting AI Agent (photo triage)
4. Supplier Coordination AI Agent (garage + rental)
5. Settlement AI Agent
6. Customer Communications AI Agent

## Demo Highlight

Shows how AI agents collaborate on a **fast, supplier-driven motor claim**, with photo analysis, repairer assignment, rental coordination, and recovery of excess all visible in a single timeline.
