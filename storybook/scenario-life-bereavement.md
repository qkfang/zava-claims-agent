# Scenario: Life Insurance Bereavement — Compassionate Claim for a Beneficiary

## Flavor

A life insurance claim made by a grieving beneficiary. Showcases empathetic communication, document guidance, sensitive identity verification, and a streamlined, low-friction settlement. This scenario is intentionally quiet and human-centred — the AI agents stay in the background and make the experience as gentle as possible.

## Customer

**Robert Chen** — Life Insurance Beneficiary

- Recently lost his mother
- Quiet, emotional, sensitive to tone
- Overwhelmed by paperwork during a period of grief

## Incident

Robert's mother held a life insurance policy for many years. Robert is the named beneficiary. He is now responsible for lodging the claim, providing documents, and coordinating with the insurer while also managing funeral arrangements and family matters.

---

## Claim Journey

### 1. First Contact — Customer Communications AI Agent

Robert's first interaction is a phone call. The **Customer Communications AI Agent** assists the human officer:

- Detects that the call is a **bereavement claim** within the first 30 seconds.
- Suggests an **empathetic call script**, suppresses upsell prompts, and disables routine "satisfaction survey" follow-ups.
- Recommends a **single point of contact** model so Robert never has to re-explain his loss to multiple people.
- Pre-fills a private case note: "Bereavement claim. Sensitive. Single point of contact."

> Sarah greets Robert warmly, listens, and reassures him there is no rush.

---

### 2. First Notice of Loss — Claims Intake AI Agent

- The **Claims Intake AI Agent** captures only what is essential at first call:
  - Policyholder's full name and date of birth
  - Date of passing
  - Robert's relationship to the policyholder
  - A safe contact method and time of day Robert prefers
- It does **not** ask for documents on the call. Instead, it generates a **gentle, one-page checklist** sent by email and post:
  - Death certificate
  - Robert's photo ID
  - Bank account details for payment
  - A short claim form (pre-filled where possible)
- It flags the claim with a **"sensitive case"** tag so all later interactions are handled with appropriate tone and authority.

**Claim:** `CLM-2026-00518`.

---

### 3. Coverage Check — Claims Assessment AI Agent

- The **Claims Assessment AI Agent** confirms:
  - The policy was active and premiums were paid.
  - The policy was held for over the **2-year non-disclosure period**, so disclosure exclusions do not apply.
  - The cause of death is not within any specific exclusion.
- It identifies the policy is straightforward — no exclusions apply, and the sum insured is `$250,000`.
- It pre-prepares an **approval recommendation** subject to identity and document verification.

> Daniel reviews the file and concurs.

---

### 4. Document Guidance — Customer Communications AI Agent

When Robert uploads documents through the portal, the **Customer Communications AI Agent**:

- Acknowledges receipt of each document with a warm, plain-English message.
- Identifies that the **death certificate** is an interim certificate; gently explains that the final certificate will be needed and reassures Robert there is no immediate urgency.
- Detects a missing page in the photo ID upload and asks for it gently, without making Robert feel he has done something wrong.
- Drafts a short, kind email when there is any silence longer than 3 days.

---

### 5. Identity and Probate Check — Fraud Investigation AI Agent (low-touch)

The **Fraud Investigation AI Agent** runs **silent, low-friction checks**:

- Verifies the death certificate against public registry data.
- Confirms Robert's identity through standard ID verification.
- Confirms Robert is the **named beneficiary** on the policy (no probate required).
- Risk score: **Low**, with explanation. No interview needed.

The agent surfaces a green tick on Elena's queue with one line: "No further investigation recommended."

---

### 6. Approval — Claims Team Leader AI Agent

- Settlement value $250,000 is above Daniel's authority.
- The **Claims Team Leader AI Agent** prepares Mark a **one-page approval brief**: cover, beneficiary, identity check, fraud review outcome, and the recommended payment.
- Mark approves with a single signature.

---

### 7. Settlement — Settlement AI Agent

- The **Settlement AI Agent** calculates the payable amount: `$250,000` (no excess applies for life cover).
- It validates the **payee name matches** the verified beneficiary and that bank account details have passed account verification.
- It releases payment and records a complete audit trail.

---

### 8. Closing Communication — Customer Communications AI Agent

The **Customer Communications AI Agent** drafts the final letter:

- Confirms payment.
- Acknowledges Robert's loss in a sincere, non-templated tone.
- Provides a single contact point in case Robert has any further questions.
- **Suppresses** the standard cross-sell and feedback survey for a defined period.

---

## AI Agents Featured

1. Customer Communications AI Agent (empathy-first, document guidance, closing letter)
2. Claims Intake AI Agent (minimal, gentle data capture; sensitive-case flag)
3. Claims Assessment AI Agent (cover and exclusion check)
4. Fraud Investigation AI Agent (silent, low-touch verification)
5. Claims Team Leader AI Agent (one-page approval)
6. Settlement AI Agent (clean payment with payee verification)

## Demo Highlight

Shows how AI agents can make a **bereavement claim quiet, kind, and simple**. The same agents that drive efficiency in other scenarios here step back, reduce friction, and protect the customer's dignity — proof that AI in claims is not just about speed, but about appropriate care.
