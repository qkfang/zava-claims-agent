# Claims Industry Characters

> Part of **Claims Team in a Day** — the AI claims office demo for **Zava Insurance**.

## Overview

This document describes realistic characters in the **Zava Insurance** claims team featured in *Claims Team in a Day*, split between **staff** and **customers**. These characters can be used for journey mapping, product demos, AI agent design, training scenarios, service design, or role-play.

Each staff member is supported by one or two specialised AI agents. The agents handle day-to-day, repeatable tasks and report findings, drafts, and recommendations back to the human, who keeps final judgement and accountability.

To make the cast easy to remember, each staff member’s first name starts with the same letter as a keyword in their role (for example, **I**ris for Claims **I**ntake, **A**dam for Claims **A**ssessor). Their agents share the same first name, numbered to distinguish them.

---

## Human–Agent Relationships

| Human (Staff) | Role | AI Agent(s) | Agent Focus |
|---|---|---|---|
| Iris | Claims Intake Officer | Agent Iris #1 | First notice of loss capture and customer triage |
| Iris | Claims Intake Officer | Agent Iris #2 | Document checklist and intake quality checks |
| Adam | Claims Assessor | Agent Adam #1 | Policy coverage and exclusions analysis |
| Adam | Claims Assessor | Agent Adam #2 | Evidence review and missing-information chase-ups |
| Lara | Loss Adjuster | Agent Lara #1 | Site visit prep, photo and report summarisation |
| Lara | Loss Adjuster | Agent Lara #2 | Loss valuation and assessment report drafting |
| Theo | Claims Team Leader | Agent Theo #1 | Workload, escalation, and SLA monitoring |
| Theo | Claims Team Leader | Agent Theo #2 | Quality assurance and complaint summary briefings |
| Felix | Fraud Investigator | Agent Felix #1 | Anomaly detection and inconsistency flagging |
| Felix | Fraud Investigator | Agent Felix #2 | Claim history cross-checks and verification outreach drafts |
| Sam | Supplier Coordinator | Agent Sam #1 | Supplier selection, booking, and status tracking |
| Seth | Settlement Officer | Agent Seth #1 | Payout calculation and settlement statement drafting |
| Seth | Settlement Officer | Agent Seth #2 | Excess, limits, and adjustment validation |
| Cara | Customer Communications Specialist | Agent Cara #1 | Status updates and outcome letter drafting |
| Cara | Customer Communications Specialist | Agent Cara #2 | Tone, empathy, and plain-English review |

---

# Staff Characters

## 1. Iris — Claims Intake Officer

**Role:** First point of contact when a customer lodges a claim.

**What she does:**
- Records claim details
- Checks basic policy information
- Confirms the type of loss or incident
- Requests required documents
- Explains the next steps in the claims process

**Personality:**
Calm, organised, patient, and reassuring.

**Typical line:**

> “I’ll lodge this now and send you a checklist of what we need to assess it.”

### Supporting AI Agents

- **Agent Iris #1 — Intake Triage Assistant**
  - Captures first notice of loss from calls, forms, and messages
  - Extracts policy number, incident type, date, and location
  - Performs an initial severity and urgency triage
  - Reports a structured intake summary back to Iris for confirmation

- **Agent Iris #2 — Document Checklist Assistant**
  - Generates the right document checklist for the claim type
  - Tracks which documents have been received versus outstanding
  - Sends gentle reminder drafts for Iris to review and approve
  - Flags incomplete or low-quality submissions for her attention

---

## 2. Adam — Claims Assessor

**Role:** Reviews the claim and determines whether it is covered under the policy.

**What he does:**
- Reviews policy wording
- Checks coverage, limits, and exclusions
- Assesses submitted evidence
- Requests missing information
- Recommends approval, partial approval, or denial

**Personality:**
Analytical, detail-focused, fair, and careful.

**Typical line:**

> “Based on the policy, the damage appears covered, but we still need the repair report.”

### Supporting AI Agents

- **Agent Adam #1 — Coverage Analysis Assistant**
  - Reads the policy schedule and product wording
  - Maps the reported incident to relevant clauses, limits, and exclusions
  - Drafts a preliminary coverage opinion with citations
  - Reports the analysis back to Adam for final assessor judgement

- **Agent Adam #2 — Evidence Review Assistant**
  - Summarises photos, invoices, and third-party reports
  - Highlights gaps between submitted evidence and policy requirements
  - Drafts polite information-request messages to the customer
  - Surfaces inconsistencies for Adam to investigate

---

## 3. Lara — Loss Adjuster

**Role:** Investigates larger, complex, or high-value claims.

**What she does:**
- Conducts site inspections
- Interviews customers, witnesses, or contractors
- Reviews photos, reports, invoices, and damage evidence
- Estimates loss value
- Prepares formal assessment reports

**Personality:**
Practical, investigative, professional, and field-oriented.

**Typical line:**

> “I’ll inspect the property and confirm the likely cause of the damage.”

### Supporting AI Agents

- **Agent Lara #1 — Site Visit Assistant**
  - Prepares pre-visit briefings from the claim file
  - Suggests inspection checklists tailored to the loss type
  - Summarises on-site photos, notes, and voice memos
  - Reports a structured site summary back to Lara

- **Agent Lara #2 — Valuation and Reporting Assistant**
  - Cross-references quotes, invoices, and market rates
  - Drafts loss valuation ranges with supporting reasoning
  - Prepares a draft formal assessment report for Lara to refine
  - Flags items where human judgement is clearly required

---

## 4. Theo — Claims Team Leader

**Role:** Manages claims staff, escalations, workloads, and high-value decisions.

**What he does:**
- Reviews escalated claims
- Approves high-value settlements
- Handles complaints
- Monitors team performance
- Supports and coaches claims staff

**Personality:**
Decisive, experienced, supportive, and commercially aware.

**Typical line:**

> “I’ve reviewed the file, and we’ll escalate this for priority assessment.”

### Supporting AI Agents

- **Agent Theo #1 — Workload and Escalation Assistant**
  - Monitors queue volumes, SLA risk, and ageing claims
  - Suggests reassignments and priority escalations
  - Surfaces claims approaching authority limits
  - Reports a daily team-health briefing back to Theo

- **Agent Theo #2 — Quality and Complaints Assistant**
  - Samples completed claims for quality review
  - Summarises complaint themes and root causes
  - Drafts coaching notes Theo can adapt for team members
  - Highlights regulatory or reputational risk for human decision

---

## 5. Felix — Fraud Investigator

**Role:** Reviews suspicious or inconsistent claims.

**What he does:**
- Checks for inconsistencies in claim details
- Reviews suspicious documents or timelines
- Compares the claim against prior claim history
- Contacts third parties for verification
- Prepares investigation findings

**Personality:**
Observant, careful, skeptical, and evidence-driven.

**Typical line:**

> “Some details don’t match the initial report, so we need to verify them before proceeding.”

### Supporting AI Agents

- **Agent Felix #1 — Anomaly Detection Assistant**
  - Scans claim narratives, timelines, and documents for inconsistencies
  - Compares stated facts against metadata and prior statements
  - Assigns a structured risk indicator with reasoning
  - Reports flagged items back to Felix for human investigation

- **Agent Felix #2 — Verification Assistant**
  - Cross-checks claim history and known fraud patterns
  - Drafts verification queries to third parties (repairers, hospitals, police)
  - Summarises responses and remaining open questions
  - Prepares an initial findings pack for Felix to validate

---

## 6. Sam — Supplier Coordinator

**Role:** Arranges and oversees the third-party suppliers, repairers, and contractors needed to resolve a claim.

**What he does:**
- Selects approved repairers, builders, or assessors
- Books inspections and repair appointments
- Tracks supplier progress and quotes
- Resolves scheduling and quality issues
- Keeps the claim file updated with supplier status

**Personality:**
Organised, pragmatic, vendor-savvy, and dependable.

**Typical line:**

> “I’ve booked an approved repairer; they’ll be on site Tuesday morning.”

### Supporting AI Agents

- **Agent Sam #1 — Supplier Coordination Assistant**
  - Recommends suitable approved suppliers based on location and job type
  - Drafts booking requests and confirms appointment details
  - Tracks supplier ETAs, quotes, and job status
  - Reports supplier exceptions and delays back to Sam

---

## 7. Seth — Settlement Officer

**Role:** Calculates the final claim payout and prepares the settlement.

**What he does:**
- Reviews the assessment and supplier costs
- Applies excess, limits, and policy adjustments
- Prepares the settlement statement
- Issues payment instructions
- Confirms settlement details with the customer

**Personality:**
Numbers-focused, precise, transparent, and customer-fair.

**Typical line:**

> “Once we deduct the excess, your settlement comes to $4,820 — paid into your nominated account.”

### Supporting AI Agents

- **Agent Seth #1 — Settlement Calculation Assistant**
  - Aggregates assessment outcomes, supplier costs, and adjustments
  - Drafts the settlement statement with a clear breakdown
  - Prepares payment instructions for Seth to authorise
  - Reports calculation rationale for human verification

- **Agent Seth #2 — Adjustment Validation Assistant**
  - Re-checks excess, sub-limits, depreciation, and policy caps
  - Flags any figures that fall outside expected ranges
  - Suggests customer-friendly explanations of deductions
  - Reports validation results back to Seth before payment release

---

## 8. Cara — Customer Communications Specialist

**Role:** Keeps the customer informed and supported throughout the claim.

**What she does:**
- Sends status updates and outcome letters
- Explains decisions in plain English
- Handles customer questions and concerns
- Coordinates timely responses across departments
- Ensures empathetic, on-brand messaging

**Personality:**
Warm, articulate, empathetic, and clear.

**Typical line:**

> “I’ll send you an update today and walk you through what happens next.”

### Supporting AI Agents

- **Agent Cara #1 — Status Update Assistant**
  - Drafts status updates and outcome letters from claim file events
  - Tailors messaging to the claim stage and customer profile
  - Suggests next-best-action prompts for the customer
  - Reports drafts back to Cara for review and send-off

- **Agent Cara #2 — Tone and Plain-English Assistant**
  - Reviews drafts for empathy, clarity, and brand tone
  - Rewrites jargon-heavy passages into plain English
  - Flags messages that may need a human, more sensitive touch
  - Reports suggested edits back to Cara before delivery

---

# Customer Characters

## 9. Michael — Home Insurance Customer

**Situation:** His kitchen was damaged after a burst pipe.

**Need:**
- Wants repairs approved quickly
- Needs clear instructions on what evidence to provide
- Wants to know whether temporary accommodation or urgent repairs are covered

**Concern:**
His family cannot properly use the kitchen, and he is unsure whether water damage is covered.

**Personality:**
Stressed, practical, and eager for a fast answer.

**Typical line:**

> “I just need to know if this is covered and how soon repairs can start.”

---

## 10. Aisha — Motor Insurance Customer

**Situation:** Her car was damaged in a rear-end accident.

**Need:**
- Wants a repairer assigned
- Needs help arranging a rental car
- Wants updates on repair timing

**Concern:**
She depends on her car for work and cannot afford long delays.

**Personality:**
Busy, direct, and time-sensitive.

**Typical line:**

> “I use the car every day, so I need to understand the timeline.”

---

## 11. Tom — Small Business Owner

**Situation:** His café suffered smoke damage after an electrical fire.

**Need:**
- Wants property damage assessed
- Needs business interruption support
- Wants clarity on lost income coverage

**Concern:**
Every day the café is closed means lost revenue and staff uncertainty.

**Personality:**
Anxious, business-minded, and focused on reopening quickly.

**Typical line:**

> “The repairs are one thing, but I’m also losing revenue while we’re closed.”

---

## 12. Grace — Travel Insurance Customer

**Situation:** Her luggage was lost during an overseas trip.

**Need:**
- Wants reimbursement for clothing, medication, and essential items
- Needs guidance on what documents are acceptable
- Wants a simple process while travelling

**Concern:**
She does not have receipts for every lost item.

**Personality:**
Frustrated, overwhelmed, and looking for practical help.

**Typical line:**

> “I bought these things years ago. I don’t know how I’m supposed to prove every purchase.”

---

## 13. Robert — Life Insurance Beneficiary

**Situation:** He is making a claim after a family member passed away.

**Need:**
- Wants a compassionate and clear process
- Needs help understanding required documents
- Wants reassurance about timelines and next steps

**Concern:**
The paperwork feels overwhelming during a period of grief.

**Personality:**
Quiet, emotional, and sensitive to tone.

**Typical line:**

> “I’m trying to get this sorted, but it’s a difficult time for the family.”

---

# Summary

These characters represent a realistic claims environment with both internal staff and external customers. The staff characters show the operational side of claims handling, and each is paired with one or two specialised AI agents that take on repeatable day-to-day work and report back to the human. The customer characters show the emotional, practical, and financial pressures people experience during the claims process.
