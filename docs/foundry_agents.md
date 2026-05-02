# Mapping Claims Staff Characters into Foundry Agents

> Part of **Claims Team in a Day** — the AI claims office demo for **Zava Insurance**.

## Core Design Idea

Each staff character at **Zava Insurance** becomes a specialised Foundry agent.

Instead of building one generic “claims chatbot”, *Claims Team in a Day* models a digital claims department where every agent owns a specific part of the claim lifecycle.

The shared object across all agents is the `Claim Case`.

## Shared Claim Case Object

All agents should read from and write to a common claim record.

Example fields:

- `claim_id`
- `customer_id`
- `policy_id`
- `claim_type`
- `incident_date`
- `incident_description`
- `claim_status`
- `coverage_status`
- `documents_received`
- `missing_documents`
- `damage_photos`
- `supplier_status`
- `fraud_risk_score`
- `settlement_amount`
- `customer_updates`
- `assigned_agent`
- `next_action`
- `human_approval_required`

---

# Agent Mapping

## 1. Claims Intake Agent

**Based on:** Claims Intake Officer

### Purpose

Create the claim file and collect the first notice of loss.

### Inputs

- Customer message
- Policy number
- Incident details
- Uploaded documents or photos
- Contact information

### Tools

- Policy lookup
- Customer profile lookup
- Claim creation API
- Document upload checker
- Duplicate claim search
- Email/SMS confirmation tool

### Outputs

- New claim record
- Claim type classification
- Missing document checklist
- Urgency flag
- Next step recommendation

### Example Instruction

> You are the Claims Intake Agent. Your job is to collect accurate claim details, identify the claim type, check whether the customer has an active policy, request required documents, and create a structured claim record. Do not make final coverage decisions.

### Human Approval

Usually not required unless:

- Vulnerable customer detected
- Emergency accommodation needed
- Claim details are inconsistent
- Policy cannot be found

---

## 2. Claims Assessment Agent

**Based on:** Claims Assessor

### Purpose

Assess coverage, evidence, policy limits, exclusions, and next steps.

### Inputs

- Claim record
- Policy wording
- Product disclosure statement
- Submitted evidence
- Claim notes
- Prior claim history

### Tools

- Policy search
- Coverage rules engine
- Document summariser
- Evidence checklist
- Decision letter draft tool

### Outputs

- Coverage recommendation
- Missing information list
- Assessment summary
- Approval / partial approval / decline recommendation
- Plain-English explanation

### Example Instruction

> You are the Claims Assessment Agent. Your job is to review the claim against the relevant policy wording, identify coverage issues, check evidence, and recommend a decision. Always provide reasoning and cite the policy clause or evidence used. Do not issue the final decision without human approval.

### Human Approval

Required for:

- Declines
- Partial settlements
- Ambiguous policy interpretation
- High-value claims
- Complaints or escalations

---

## 3. Loss Adjuster Agent

**Based on:** Loss Adjuster

### Purpose

Investigate complex damage and prepare a loss report.

### Inputs

- Claim file
- Damage photos
- Repair quotes
- Inspection notes
- Contractor reports
- Weather/event data where relevant

### Tools

- Image/document analysis
- Inspection checklist generator
- Contractor quote comparison
- Report drafting tool
- Cost benchmark lookup

### Outputs

- Damage scope
- Cause-of-loss summary
- Inspection questions
- Cost reasonableness check
- Loss adjusting report draft
- Recommendation for assessor

### Example Instruction

> You are the Loss Adjuster Agent. Your job is to support complex claim investigation by reviewing damage evidence, preparing inspection briefs, drafting scope of loss, and identifying issues that need human review. You do not finalise settlement or coverage.

### Human Approval

Required for:

- Final loss report
- Large-loss findings
- Disputed cause of damage
- Underinsurance issues
- Safety or liability concerns

---

## 4. Fraud Investigation Agent

**Based on:** Fraud Investigator

### Purpose

Detect suspicious patterns and prepare investigation recommendations.

### Inputs

- Claim timeline
- Customer statements
- Uploaded documents
- Receipts
- Prior claims
- Supplier data
- External verification results

### Tools

- Timeline builder
- Document comparison
- Duplicate receipt checker
- Prior claims search
- Risk scoring model
- Investigation checklist generator

### Outputs

- Fraud risk score
- Explainable risk indicators
- Timeline inconsistencies
- Investigation action plan
- Case summary for investigator

### Example Instruction

> You are the Fraud Investigation Agent. Your job is to identify inconsistencies, unusual patterns, and possible fraud indicators. You must explain every risk flag clearly. Do not accuse the customer of fraud. Recommend investigation steps for a human investigator.

### Human Approval

Always required before:

- Fraud referral
- Claim delay due to investigation
- Customer interview request
- Claim decline based on fraud concerns

---

## 5. Supplier Coordinator Agent

**Based on:** Supplier Coordinator

### Purpose

Coordinate repairers, builders, tow providers, assessors, and other third parties.

### Inputs

- Claim type
- Customer location
- Damage type
- Approved scope
- Supplier availability
- Supplier performance data

### Tools

- Supplier directory
- Appointment scheduler
- Quote request tool
- SLA tracker
- Invoice matching tool
- Customer notification tool

### Outputs

- Recommended supplier
- Appointment options
- Supplier status
- Overdue task alerts
- Quote comparison
- Customer update draft

### Example Instruction

> You are the Supplier Coordinator Agent. Your job is to recommend suitable suppliers, schedule inspections or repairs, follow up on overdue responses, and keep the claim file updated. Do not approve invoices above authority limits.

### Human Approval

Required for:

- Non-preferred supplier selection
- High-cost supplier quote
- Supplier dispute
- Scope variation
- Customer complaint about supplier

---

## 6. Settlement Agent

**Based on:** Settlement Officer

### Purpose

Calculate the payable settlement and prepare payment documentation.

### Inputs

- Approved claim amount
- Policy limits
- Excess/deductible
- Depreciation rules
- Prior payments
- Supplier invoice
- Bank/payee details

### Tools

- Settlement calculator
- Payment validation
- Authority limit checker
- Invoice matcher
- Settlement letter generator
- Finance/payment API

### Outputs

- Settlement calculation
- Payable amount
- Excess applied
- Settlement option comparison
- Payment approval request
- Settlement letter draft

### Example Instruction

> You are the Settlement Agent. Your job is to calculate the payable settlement using approved claim data, policy limits, excess, depreciation, and prior payments. Show the calculation clearly. Do not release payment without the required authority approval.

### Human Approval

Required for:

- Payment release
- Payee mismatch
- High-value settlement
- Ex-gratia payment
- Manual override
- Customer dispute

---

## 7. Customer Communications Agent

**Based on:** Customer Communications Specialist

### Purpose

Draft clear, empathetic, compliant customer communications.

### Inputs

- Claim status
- Assessment notes
- Missing documents
- Customer sentiment
- Decision outcome
- Complaint history

### Tools

- Email/SMS drafting
- Tone adjustment
- Plain-English rewriting
- Template library
- Compliance checker
- Translation tool if needed

### Outputs

- Status update
- Request for information
- Approval message
- Decline letter draft
- Complaint response draft
- Call script

### Example Instruction

> You are the Customer Communications Agent. Your job is to explain claim updates in clear, empathetic, plain English. Match the tone to the customer situation. Do not invent claim facts, make promises, or communicate final decisions unless they have been approved.

### Human Approval

Required for:

- Decline letters
- Complaint responses
- Sensitive claims
- Bereavement claims
- Legal or regulatory wording

---

## 8. Team Leader Agent

**Based on:** Claims Team Leader

### Purpose

Orchestrate work, monitor claims, and manage escalations.

### Inputs

- All open claims
- Team workload
- SLA status
- Escalations
- Complaints
- Approval requests
- Agent outputs

### Tools

- Claims dashboard
- Work queue manager
- Escalation router
- Quality assurance checker
- Approval workflow
- Reporting tool

### Outputs

- Workload summary
- Escalation list
- Approval recommendations
- Quality issues
- Coaching insights
- Daily operations dashboard

### Example Instruction

> You are the Team Leader Agent. Your job is to monitor claims operations, identify bottlenecks, summarise escalations, review approval requests, and recommend priorities for human managers. You do not override human authority limits.

### Human Approval

Required for:

- High-value approvals
- Declines
- Complaints
- Policy exceptions
- Work reassignment rules
- Regulatory or legal risk

---

# Suggested Multi-Agent Workflow

## Workflow: New Claim to Settlement

1. `Claims Intake Agent`
   - Creates the claim.
   - Classifies the claim type.
   - Requests required documents.

2. `Claims Assessment Agent`
   - Reviews policy and evidence.
   - Decides whether the claim can proceed.
   - Requests more information if needed.

3. `Loss Adjuster Agent`
   - Runs only for complex or high-value claims.
   - Reviews damage evidence.
   - Drafts loss report.

4. `Fraud Investigation Agent`
   - Runs when fraud indicators are detected.
   - Produces risk summary and investigation plan.

5. `Supplier Coordinator Agent`
   - Assigns supplier.
   - Tracks inspection or repair.
   - Follows up overdue suppliers.

6. `Settlement Agent`
   - Calculates payable amount.
   - Prepares settlement.
   - Requests approval.

7. `Customer Communications Agent`
   - Sends updates throughout the claim.
   - Drafts final decision communication.

8. `Team Leader Agent`
   - Monitors the full workflow.
   - Handles escalations and approvals.

---

# Recommended Agent Architecture

## Option A: One Agent per Department

Use this if the demo needs to visually match the voxel office.

Agents:

- `claims-intake-agent`
- `claims-assessment-agent`
- `loss-adjuster-agent`
- `fraud-investigation-agent`
- `supplier-coordination-agent`
- `settlement-agent`
- `customer-communications-agent`
- `team-leader-agent`

Best for:

- Demo storytelling
- Visual department layout
- Clear responsibilities
- Agent-to-agent handoffs

---

## Option B: One Orchestrator plus Specialist Agents

Use this if the demo needs stronger workflow control.

Agents:

- `claims-orchestrator-agent`
- `claims-intake-agent`
- `coverage-assessment-agent`
- `loss-review-agent`
- `fraud-review-agent`
- `supplier-agent`
- `settlement-agent`
- `communications-agent`

The orchestrator decides which specialist agent runs next.

Best for:

- More realistic enterprise workflow
- Complex branching
- Human approval gates
- Easier observability

---

# Suggested Foundry Objects

## Claim

The central operational object.

## Policy

Used by Claims Assessment Agent.

## Customer

Used by Intake and Communications.

## Document

Used by Assessment, Fraud, and Settlement.

## Supplier

Used by Supplier Coordinator.

## Payment

Used by Settlement Agent.

## Task

Used by Team Leader and workflow orchestration.

## Communication

Used by Customer Communications Agent.

## Escalation

Used by Team Leader Agent.

---

# Suggested Agent Handoff Rules

## Intake to Assessment

Trigger when:

- Claim is created
- Policy is active
- Minimum required details are captured

## Assessment to Loss Adjuster

Trigger when:

- Claim is high value
- Damage cause is unclear
- Photos or reports need technical review
- Site inspection is required

## Assessment to Fraud Investigation

Trigger when:

- Claim timeline is inconsistent
- Documents appear suspicious
- Customer has repeated similar claims
- Loss occurred soon after policy inception

## Assessment to Supplier Coordination

Trigger when:

- Claim appears covered
- Repair or inspection is needed
- Approved supplier network applies

## Supplier Coordination to Settlement

Trigger when:

- Quote or invoice is received
- Scope is approved
- Repair option or cash settlement is selected

## Settlement to Communications

Trigger when:

- Settlement is calculated
- Decision is approved
- Customer needs final explanation

## Any Agent to Team Leader

Trigger when:

- Human approval required
- Complaint detected
- SLA breached
- High-value claim
- Vulnerable customer
- Policy exception
- Fraud concern

---

# Human-in-the-Loop Design

Foundry workflows are a good fit for this because claims often need repeatable orchestration and approval gates. Azure Foundry documentation describes workflow agents as useful for multi-step orchestration, agent coordination, approval workflows, branching, and human-in-the-loop steps. :contentReference[oaicite:1]{index=1}

Use human approval for:

- Final claim decision
- Decline decision
- Fraud referral
- Settlement payment
- High-value claim
- Complaint response
- Policy exception
- Sensitive communication

The agent should recommend, draft, summarise, and check. The human should approve, override, or finalise.

---

# Demo-Friendly Interaction Model

A good demo flow could look like this:

## Step 1: Customer submits claim

Customer says:

> My kitchen flooded after a pipe burst.

The `Claims Intake Agent` creates the claim and asks for:

- Photos
- Plumber report
- Incident date
- Emergency repair invoice

## Step 2: Assessment begins

The `Claims Assessment Agent` checks policy wording and says:

> This may be covered under accidental escape of liquid, but the plumber report is required to confirm cause.

## Step 3: Loss review

The `Loss Adjuster Agent` reviews photos and says:

> The visible damage is consistent with water escape, but there may be pre-existing cabinet swelling.

## Step 4: Supplier coordination

The `Supplier Coordinator Agent` recommends:

> Assign preferred builder A. Earliest inspection is tomorrow at 10:00 AM.

## Step 5: Settlement

The `Settlement Agent` calculates:

> Approved repair amount: $4,800. Excess: $750. Payable amount: $4,050.

## Step 6: Customer communication

The `Customer Communications Agent` drafts:

> We’ve reviewed your claim and approved repairs. Your excess is $750, and your repairer will contact you to confirm the appointment.

## Step 7: Team leader dashboard

The `Team Leader Agent` shows:

- 12 claims awaiting documents
- 5 claims awaiting supplier reports
- 3 claims need approval
- 1 vulnerable customer claim overdue

---

# UI Mapping to the Voxel Office

Each department in the voxel office can become a clickable card or room.

## Reception

Launches claim intake.

## Claims Intake Department

Shows new claims and missing information.

## Claims Assessment Department

Shows coverage review and evidence checklist.

## Loss Adjusting Department

Shows damage photos and inspection reports.

## Fraud Investigation Department

Shows risk indicators and timeline comparison.

## Supplier Coordination Department

Shows supplier status and appointments.

## Settlement Department

Shows settlement calculation and payment approval.

## Customer Communications Department

Shows message drafts and customer sentiment.

## Team Leader Office

Shows dashboard, escalations, and approvals.

## Meeting Room

Shows multi-agent case review.

---

# Best Demo Framing

The strongest framing is:

> Each staff member in the claims office becomes a Foundry agent with a specialised role, governed tools, structured outputs, and human approval points. Together, they operate as a coordinated digital claims department.

This makes the demo feel enterprise-ready and avoids the impression that AI is replacing claims professionals entirely.