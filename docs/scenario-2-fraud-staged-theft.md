# Scenario 2: Suspected Fraud — Staged Theft with Fabricated Receipts

## Flavor

A claim that initially looks routine but reveals fabricated documents and inconsistent statements. Showcases the **Fraud Investigation AI Agent**, anomaly detection, timeline reconstruction, and the careful, evidence-driven path to declining a claim while staying compliant.

## Customer

**"Jordan Pierce"** — Contents Insurance Customer (claimant under investigation)

- New customer, policy purchased 6 weeks before the alleged incident
- Has lodged two prior contents claims at a previous insurer in the past 18 months
- Claims a high-value laptop, camera, and watch were stolen during a home break-in

## Incident (as reported)

Jordan reports that his apartment was burgled while he was away for the weekend. He says the front door was forced, and that a laptop, professional camera, and a luxury watch — totalling **$11,400** — were taken. He provides receipts and a police event number.

---

## Claim Journey

### 1. First Notice of Loss — Claims Intake AI Agent

- The **Claims Intake AI Agent** captures the incident details, police event number, and a list of stolen items.
- It requests proof of ownership: receipts, photographs, and serial numbers.
- It runs **duplicate detection** and notes a similar contents claim from the same customer at a prior insurer (cross-industry data feed).
- It flags the claim as **"review for fraud indicators"** based on policy age (6 weeks) and high claim value.

**Handoff:** Claim `CLM-2026-00219` routed to assessment with a fraud-review tag.

---

### 2. Coverage Check — Claims Assessment AI Agent

- The **Claims Assessment AI Agent** confirms cover is technically in place: contents policy, theft is included, the limit is sufficient.
- It notes:
  - The watch ($6,200) exceeds the unspecified valuables sub-limit and would normally need to be itemised — it was not.
  - One receipt has a date **after** the reported incident date.
- It does not deny the claim. Instead, it raises the issues, recommends partial coverage at most for the watch, and **escalates to fraud review** because of document inconsistencies.

---

### 3. Anomaly Detection — Fraud Investigation AI Agent

The **Fraud Investigation AI Agent** runs a structured review.

**Anomaly findings:**

| Indicator | Detail |
|---|---|
| Policy timing | Policy purchased 6 weeks before incident, with high-value items added 5 days before the loss. |
| Document forensics | One "receipt" PDF has metadata showing it was created **3 days after** the reported burglary. |
| Image reuse | The camera "proof of ownership" photo is a reverse-image match to a public product listing. |
| Receipt mismatch | Watch "receipt" shows a retailer that does not stock that watch model. |
| Claim history | Two prior contents claims at another insurer in 18 months, both for electronics. |
| Statement drift | The police report describes a single forced door; the customer's later statement mentions a smashed window that was not reported to police. |

It assigns a **risk score: High**, with explainable reasons (not a black-box score).

---

### 4. Timeline Reconstruction

- The **Fraud Investigation AI Agent** builds a single timeline from:
  - Customer's online lodgement
  - Phone call notes
  - Police event log
  - Receipt PDF metadata
  - Policy purchase and endorsement history
- The timeline visually shows the **receipt was created after the incident**, and that valuables were endorsed onto the policy days before the alleged loss.

---

### 5. Investigation Plan

The agent recommends:

1. Request **original receipts** (not PDFs) and bank or card statements showing purchase.
2. Request the **watch's serial number** and warranty card.
3. Contact the retailer named on the watch receipt to verify authenticity.
4. Arrange a **recorded interview** with the customer to clarify the door vs. window discrepancy.
5. Pause settlement until verification completes.

> Felix, the fraud investigator, reviews the brief, accepts the plan, and contacts the retailer.

---

### 6. Evidence Outcome

- The retailer confirms the receipt is **not genuine** — the receipt number does not exist in their system.
- The customer is unable to produce bank statements showing the purchase.
- During the recorded interview, the customer's account of entry changes a third time.

---

### 7. Decision and Customer Communications

- The **Claims Assessment AI Agent** prepares a decline recommendation citing **fraudulent documents** and **misrepresentation**, referencing the policy's fraud clause.
- Theo, the team leader, approves the decision with full audit trail.
- The **Customer Communications AI Agent** drafts a **compliant, neutral, plain-English decline letter** that:
  - Cites the specific policy clauses
  - Lists the verifiable evidence relied on
  - Avoids accusatory language
  - Includes the customer's right to complain or seek external review
- The case is referred to the insurer's special investigations team and logged in the industry fraud register, in line with policy and regulation.

---

## AI Agents Featured

1. Claims Intake AI Agent (duplicate detection, fraud tag)
2. Claims Assessment AI Agent (escalation, partial-cover analysis)
3. Fraud Investigation AI Agent (anomaly detection, timeline, risk score, investigation plan)
4. Claims Team Leader AI Agent (escalation review, approval support)
5. Customer Communications AI Agent (compliant decline letter)

## Demo Highlight

Shows how AI agents support a **careful, evidence-driven fraud workflow**: detecting anomalies early, reconstructing the timeline, recommending investigation steps, and producing a defensible decision — without replacing human judgement.
