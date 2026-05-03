# `src/logic` — Claims Email Logic App workflow

This folder contains the Azure **Logic Apps Standard** workflow set used by the **Claims Team in a Day** demo for **Zava Insurance**. It implements the email-based first-notice-of-loss (FNOL) intake channel: when a customer emails the claims team mailbox, this workflow picks the email up, calls a Foundry agent to triage / capture the claim, logs the run to OneLake (Microsoft Fabric), and escalates to a human Claims Team Leader via Teams when the agent cannot fully process the request.

The workflows here were ported from the reference implementation in
[`qkfang/tfn-processing/apps/logicapp-tfn`](https://github.com/qkfang/tfn-processing/tree/main/apps/logicapp-tfn) and re-pointed at Zava Claims resources, agents, and terminology.

## Files

| File | Type | Purpose |
| --- | --- | --- |
| `monitor-email-processing.json` | Stateful workflow | Trigger on a new email arriving in the claims team mailbox (Office 365 connector, Inbox folder). An orchestrator Agent action reads the subject + body and dispatches to either `claims-email-processing` (real intake) or `return-email-processing` (acknowledgement / outbound email). |
| `claims-email-processing.json` | Stateful workflow | Main claim intake pipeline. Uploads attachments to blob, builds a multimodal Foundry conversation, calls the `claims-email-agent`, records each step to a OneLake JSON log via `fabric-file-log`, and engages a human via Teams (HIL) when the agent reports `processed_status=false`. |
| `return-email-processing.json` | Stateful workflow | Mirror pipeline for sending acknowledgement / status update emails back to customers, using the `return-email-agent`. Same Fabric-log + HIL escalation pattern. |
| `fabric-file-log.json` | Stateful workflow | Helper workflow that PUTs a JSON file into the `LH_Claims.Lakehouse/Files/` folder of the `Zava_Claims_Demo` Fabric workspace using the workflow's user-assigned managed identity. Called by both processing workflows at each major step. |
| `Analyze_Document_for_Prebuilt_or_Custom_models_v4_x_API.json` | Stateful workflow | Wrapper around the Document Intelligence v4 connector. Exposed as the `Analyze_Document_for_Prebuilt_or_Custom_models_v4_x_API` tool inside `document-int-mcp`. |
| `claims-email-agent.yaml` | Foundry agent prompt | Instructions for the **Claims Intake Officer** agent: extract claim details from email + attachments, validate, and create/update the claim via the `claims_data_mcp` MCP server. |
| `return-email-agent.yaml` | Foundry agent prompt | Mock agent that returns a fixed JSON envelope, used to simulate a successful return-email send for the demo. |

## How it fits the demo

This workflow is the **email front door** of the Zava Insurance claims office:

1. **Customer** emails `claims@zava-insurance.com`.
2. `monitor-email-processing` fires on the new mail and an orchestrator agent decides which sub-flow to run.
3. `claims-email-processing` invokes the **Claims Intake Officer** Foundry agent, which uses MCP tools to look up the policy and create/update the claim record.
4. Every step is appended to a per-run JSON log in the `LH_Claims` Fabric Lakehouse for observability (used later by the Team Leader dashboard).
5. If the agent cannot complete the intake, the **Tool_HIL** branch posts an actionable card in Teams to the **Claims Team Leader** for manual review, and the reviewer's response is logged back into the same Fabric file.

This gives the demo a realistic "claims work doesn't disappear into a chatbot — it becomes a tracked, auditable case the team can take over" story.

## External resources referenced (to be provisioned)

The workflow definitions reference the following resources by name. Values that are demo-environment specific (subscription id, tenant) are kept as placeholders and need to be substituted at deploy time:

- **Azure Foundry project** — `https://zava-foundry.services.ai.azure.com/api/projects/zava-claims-project`
- **User-assigned managed identity** — `/subscriptions/<sub>/resourceGroups/rg-zava-claims/.../zava-claims-logic-uid` (granted access to Foundry, OneLake, and Blob storage)
- **Fabric Lakehouse** — workspace `Zava_Claims_Demo`, lakehouse `LH_Claims.Lakehouse`
- **Blob container** — `email-attachment` on the Logic App's storage account
- **MCP server (claims data)** — `https://zava-claims-backend.azurewebsites.net/api/mcp` exposing `lookup_customer`, `lookup_policy`, `lookup_claim`, `create_claim`, `update_claim`, `search_claims`
- **MCP server (document intelligence)** — `https://logic-dev.azurewebsites.net/api/mcpservers/document-int-mcp/mcp`
- **API connections** used by the workflows (must exist in the Logic App):
  - `conn-office365` — for the email trigger
  - `conn-teams` — for the human-in-the-loop card
  - `conn-azuread` — to resolve the responder identity
  - `conversionservice` / `conn-conversionservice` — html-to-text
  - `formrecognizer` — Document Intelligence (used by the Analyze workflow)
  - `agent` — Foundry agent model connection used by inline `Agent` actions
  - `AzureBlob` service provider — attachment upload / read

## Deploying

These files are workflow definitions only (no `host.json`, `connections.json`, or `parameters.json`). To run them, drop each `*.json` into a Logic App Standard project as `<workflow-name>/workflow.json`, define the connections listed above, and upload the two `*.yaml` agent prompts to the Foundry project as agents named `claims-email-agent` and `return-email-agent`.

## Provenance

Ported from `qkfang/tfn-processing/apps/logicapp-tfn` (commit `12d5673`). The TFN-update domain logic was replaced with Zava Insurance claims-intake logic; the Logic App orchestration, HIL pattern, and Fabric logging structure are preserved.
