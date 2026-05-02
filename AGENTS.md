# AGENTS.md

## Demo Purpose

This demo explores how an AI-powered claims office could work inside the insurance claims industry. The goal is to present a realistic, easy-to-understand claims environment where different staff roles are represented as specialized AI agents.

The demo is designed to show that claims is not a separate industry from insurance, but a key operational function within it. Claims teams manage the process after a customer experiences an insured event, such as a car accident, home damage, lost luggage, business interruption, or bereavement-related life insurance claim.

---

## Core Concept

The demo uses a **claims office** as the central visual and product metaphor.

The office is shown as a modern, voxel-style, bird’s-eye-view workplace with clearly separated departments. Each department represents a real claims function, and each staff role can be expanded into an AI agent that supports or automates part of the claims journey.

For the full visual theme, office layout, departments, and atmosphere guidance, refer to [docs/theme_office.md](docs/theme_office.md). For the surrounding neighbourhood theme, refer to [docs/theme_neighhood.md](docs/theme_neighhood.md).

---

## Target Story

The demo should communicate the following story:

> A customer has an insurance issue and needs to make a claim. Inside the claims office, different specialist agents help process the claim from first notice of loss through assessment, investigation, supplier coordination, settlement, and customer communication.

The experience should make the claims process feel tangible and understandable.

---

## Key Claim Journey

The demo should broadly follow this flow:

1. Customer reports a claim.
2. Claims Intake captures the claim details.
3. Claims Assessment checks policy coverage and evidence.
4. Loss Adjusting investigates damage or complex losses.
5. Fraud Investigation reviews suspicious or inconsistent claims.
6. Supplier Coordination arranges repairers, builders, assessors, or other third parties.
7. Settlement calculates and prepares payment.
8. Customer Communications keeps the customer informed.
9. Team Leader monitors escalations, workload, and quality.

For the detailed AI agent capabilities for each role in this journey, refer to [docs/foundry_agents.md](docs/foundry_agents.md).

---

## Staff and Customer Characters

The demo includes a cast of staff characters (Claims Intake Officer, Claims Assessor, Loss Adjuster, Fraud Investigator, Supplier Coordinator, Settlement Officer, Customer Communications Specialist, and Claims Team Leader) and customer personas representing common claim scenarios across home, motor, business, travel, and life insurance.

For the full character profiles, personalities, situations, and example dialogue, refer to [docs/characters.md](docs/characters.md).

For the AI agent capabilities mapped to each staff role, refer to [docs/foundry_agents.md](docs/foundry_agents.md).

---

## Product Message

The demo should show that AI agents are not one generic chatbot. Instead, the system works like a coordinated digital claims department, where each agent has a clear role and supports a specific part of the claims lifecycle.

The intended message is:

> Claims work is complex, but it can be made clearer, faster, and more consistent by assigning specialised AI agents to each stage of the process.

---

## Tone

Use language that is:

- Clear
- Practical
- Business-friendly
- Realistic
- Not overly technical
- Suitable for an insurance or claims operations audience

---

## GitHub Copilot Guidance

When generating code, content, UI components, or documentation for this demo:

- Preserve the claims-office metaphor.
- Represent each AI agent as a specialised role.
- Keep the claims journey visible.
- Use realistic insurance claims terminology.
- Prefer structured layouts with departments, cards, panels, or workflow stages.
- Keep customer-facing language empathetic and plain-English.
- Avoid making the system appear to fully replace human judgement.
- Show AI as supporting, triaging, drafting, summarising, checking, and recommending.
- Keep visual elements aligned with the voxel/isometric office theme described in [docs/theme_office.md](docs/theme_office.md).
- Use department names consistently across UI and documentation.
- Make the demo feel like an enterprise claims operations product, not a consumer chatbot.
- Reference the docs files for character details, scenarios, and agent capabilities rather than duplicating that content.

---

## Reference Documents

- [docs/background.md](docs/background.md) — Insurance and claims lifecycle background context.
- [docs/characters.md](docs/characters.md) — Staff and customer character profiles, scenarios, and dialogue.
- [docs/process.md](docs/process.md) — Claims process detail and AI agent role mapping.
- [docs/foundry_agents.md](docs/foundry_agents.md) — AI agent capabilities for each claims role and the agent ecosystem.
- [docs/theme_office.md](docs/theme_office.md) — Voxel office visual theme, departments, and visual direction.
- [docs/theme_neighhood.md](docs/theme_neighhood.md) — Voxel neighbourhood theme surrounding the claims office.

---

## Suggested Demo Name Options

Possible names for the demo:

- Claims Office AI
- Digital Claims Department
- Claims Agent Workspace
- AI Claims Operations Hub
- Claims Command Center
- Claims Department Simulator
- Agentic Claims Office

---

## Summary

This demo presents a voxel-style claims office where each department is represented by a specialised AI agent. The purpose is to explain and visualise how AI can assist with claim intake, assessment, loss adjusting, fraud review, supplier coordination, settlement, customer communications, and team leadership.

The final experience should help viewers quickly understand how claims processing works and how a coordinated set of AI agents can support the full claims lifecycle.

For all detailed character, process, and visual content, see the [docs/](docs/) folder.
