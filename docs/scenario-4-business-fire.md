# Scenario 4: Small Business Fire — Property Damage and Business Interruption

## Flavor

A complex commercial claim involving property damage, business interruption, and multiple suppliers. Showcases loss adjusting on a complex loss, business income calculation, escalation to a team leader for a high-value settlement, and coordination across electricians, builders, and forensic accountants.

## Customer

**Tom Bradley** — Small Business Owner

- Owns "Bradley's Café", a single-location cafe with 6 staff
- Anxious and business-minded
- Worried about lost revenue, staff wages, and reopening as fast as possible

## Incident

An overnight electrical fault in the cafe's coffee machine power circuit caused a smoke and small fire incident. The fire brigade attended. The kitchen, espresso bar, and ceiling are smoke-damaged. No one was injured. The cafe must close while the cause is investigated and repairs are made.

---

## Claim Journey

### 1. First Notice of Loss — Claims Intake AI Agent

- Tom lodges the claim the morning after, using his broker's portal.
- The **Claims Intake AI Agent** captures the incident type (fire/smoke), site address, fire brigade report number, and confirms the building is **not safe to operate**.
- It identifies **two coverage sections**: Property Damage and Business Interruption.
- It generates a tailored checklist:
  - Fire brigade incident report
  - Photos of the kitchen, espresso bar, and ceiling
  - Last 12 months of profit and loss statements
  - Staff payroll register
  - Stock loss list (perishables)
- It flags the claim as **complex / large loss** and routes it to a senior loss adjuster.

**Claim:** `CLM-2026-00412`.

---

### 2. Coverage Check — Claims Assessment AI Agent

- The **Claims Assessment AI Agent** reviews the commercial policy:
  - **Property Damage**: covered for fire and smoke damage.
  - **Business Interruption**: covered with a 30-day waiting period waived for fire.
  - **Stock**: perishables covered up to sub-limit.
- It identifies an **electrical maintenance condition** in the policy and flags that the latest electrical safety certificate must be verified.
- It produces a structured cover note for the loss adjuster.

---

### 3. Cause Investigation and Site Visit — Loss Adjusting AI Agent

The **Loss Adjusting AI Agent** prepares Priya for a complex investigation:

- Background brief: claim summary, cover sections, sub-limits, and policy conditions.
- **Key questions**: when was the espresso machine last serviced, who installed the circuit, and is the electrical certificate current?
- **Risk areas to inspect**: ceiling void, electrical board, stock fridges, suppression system.
- **Independent forensic electrician** recommended given the cause is electrical.

After the visit, the agent:

- Categorises damage from photos: **smoke staining (clean)**, **ceiling tiles (replace)**, **espresso bar joinery (replace)**, **commercial fridges (test)**, **HVAC ducting (clean and test)**.
- Drafts a **damage scope** and an estimated band of `$95,000–$130,000` for property damage.
- Flags **complex claim indicators**: high value, multiple trades, business interruption, possible third-party recovery against the espresso machine manufacturer.

---

### 4. Supplier Coordination — Supplier Coordination AI Agent

The **Supplier Coordination AI Agent** orchestrates multiple suppliers:

| Supplier | Role | Status |
|---|---|---|
| Forensic electrician | Confirm cause | Booked next day |
| Specialist smoke-cleaning crew | Soft strip, deodorise | Day 3 |
| Commercial builder | Ceiling, joinery, repaint | Quote in 5 days |
| Refrigeration technician | Inspect fridges | Day 2 |
| Forensic accountant | Validate BI loss | Day 5 |

It tracks SLAs, follows up overdue quotes, and surfaces a single status board for Priya and Tom.

---

### 5. Business Interruption — Specialist Calculation

- The **forensic accountant** receives the agent's pre-prepared brief: 12 months of P&L, payroll, and seasonality notes.
- The **Loss Adjusting AI Agent** drafts an indicative BI estimate:
  - Average weekly gross profit: $9,200
  - Estimated closure: 6 weeks
  - Reduced reopening trade for 4 weeks at 60% capacity
  - Indicative BI loss: **~$70,000**
- Stock loss (perishables): **~$3,800**.

---

### 6. Reserves and Escalation — Claims Team Leader AI Agent

- Combined estimate: property `$120,000` + BI `$70,000` + stock `$3,800` = **~$193,800**.
- The **Claims Team Leader AI Agent** alerts Mark:
  - High-value claim above Daniel's authority.
  - Multiple suppliers, complex BI calculation.
  - Recommended reserves and key approval points.
- Mark approves the reserves and the BI methodology in a single review.

---

### 7. Customer Communications — Customer Communications AI Agent

Tom is anxious and calls every two days. The **Customer Communications AI Agent**:

- Sets up a **weekly written update** plus an **on-demand summary** he can refresh in the portal.
- Translates technical assessor findings into plain English ("we've confirmed the cause was the espresso circuit, not your responsibility").
- Drafts a sensitive note when the reopening date slips by a week due to ceiling material lead time.
- Identifies signs of frustration in call notes and prompts a proactive check-in from Mark.

---

### 8. Interim Payment and Final Settlement — Settlement AI Agent

The **Settlement AI Agent** supports staged payments:

- **Interim payment 1**: $25,000 — emergency clean and stock loss, paid in week 1.
- **Interim payment 2**: $40,000 — BI advance to cover wages while closed.
- **Final settlement**: balance after final invoices and reconciled BI calculation.
- It validates each invoice against the approved scope, applies the policy excess once, checks for duplicate invoices across suppliers, and creates a complete audit trail.

---

### 9. Recovery

- The **Claims Assessment AI Agent** opens a **third-party recovery** thread against the espresso machine manufacturer based on the forensic electrician's findings.

---

## AI Agents Featured

1. Claims Intake AI Agent (complex-claim flagging)
2. Claims Assessment AI Agent (multi-section cover, conditions check)
3. Loss Adjusting AI Agent (forensic preparation, scope drafting, BI indicative model)
4. Supplier Coordination AI Agent (multi-trade orchestration)
5. Claims Team Leader AI Agent (escalation and reserves approval)
6. Customer Communications AI Agent (weekly updates, plain-English explanations)
7. Settlement AI Agent (staged payments, audit trail)

## Demo Highlight

Shows how AI agents handle a **complex commercial claim** with property damage, business interruption, and multiple suppliers, while keeping the small business owner informed and supporting the team leader's high-value approvals.
