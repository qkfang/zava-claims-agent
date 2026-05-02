# Claims Team in a Day — Foundry Agents (`src/agent`)

This project hosts the **.NET 10** Azure AI Foundry agents that power the
**Zava Insurance** claims office demo (*Claims Team in a Day*). Each staff
character described in
[`docs/characters.md`](../../docs/characters.md) is implemented as
a specialised Foundry declarative agent, following the role and tooling
mapping in [`docs/foundry_agents.md`](../../docs/foundry_agents.md).

The C# pattern is modelled on
[`qkfang/quant-agent` → `src/quantlib`](https://github.com/qkfang/quant-agent/tree/main/src/quantlib):

- `Agents/BaseAgent.cs` — wraps an Azure AI Foundry declarative agent and
  the project Responses client, with MCP auto-approval and citation
  extraction (analogous to quantlib's `BaseAgent`).
- `Agents/ClaimsAgent.cs` — shared base for every staff agent, wires up
  Azure AI Search and Bing grounding tools (analogous to quantlib's
  `QuantAgent`).
- One class per staff character, each with its own `AgentId`, persona,
  instructions and structured output format.

## Agents

| Staff character | Role | Class | Agent ID | CLI flag |
| --- | --- | --- | --- | --- |
| Sarah Mitchell | Claims Intake Officer | `ClaimsIntakeAgent` | `claims-intake-agent` | `--intake` |
| Daniel Cho | Claims Assessor | `ClaimsAssessmentAgent` | `claims-assessment-agent` | `--assessment` |
| Priya Nair | Loss Adjuster | `LossAdjusterAgent` | `loss-adjuster-agent` | `--loss-adjuster` |
| Elena Garcia | Fraud Investigator | `FraudInvestigationAgent` | `fraud-investigation-agent` | `--fraud` |
| _Supplier Coordinator_ | Supplier Coordinator | `SupplierCoordinatorAgent` | `supplier-coordination-agent` | `--supplier` |
| _Settlement Officer_ | Settlement Officer | `SettlementAgent` | `settlement-agent` | `--settlement` |
| _Customer Communications Specialist_ | Customer Communications Specialist | `CustomerCommunicationsAgent` | `customer-communications-agent` | `--communications` |
| Mark Reynolds | Claims Team Leader | `TeamLeaderAgent` | `team-leader-agent` | `--team-leader` |

Every agent represents a stage of the claim lifecycle and includes
human-in-the-loop guidance consistent with the approval rules in
`docs/foundry_agents.md`.

## Configuration

Set the following keys in `appsettings.json` (or as environment variables):

| Key | Purpose |
| --- | --- |
| `AZURE_AI_PROJECT_ENDPOINT` | Azure AI Foundry project endpoint URL |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Default chat model deployment (e.g. `gpt-4.1`) |
| `AZURE_TENANT_ID` | Optional tenant ID for `DefaultAzureCredential` |
| `AZURE_AI_SEARCH_CONNECTION_ID` | Foundry connection ID for the claims knowledge base |
| `AZURE_AI_SEARCH_INDEX_NAME` | Azure AI Search index name |
| `AZURE_BING_CONNECTION_ID` | Foundry Bing grounding connection ID |

Authentication uses `DefaultAzureCredential`, so any locally configured
identity (Azure CLI, Visual Studio, Managed Identity, etc.) will work.

## Running an agent

```bash
cd src/agent
dotnet run -- --intake "My kitchen flooded after a pipe burst this morning"
dotnet run -- --assessment "Review claim CL-1001 against policy POL-42"
dotnet run -- --team-leader "Summarise today's escalations"
```

Run with no arguments to print the full usage list.

## Adding a new agent

1. Create `Agents/<Name>Agent.cs` that extends `ClaimsAgent`.
2. Define a unique `AgentId` (kebab-case, ending in `-agent`).
3. Provide an `Instructions` string that follows the structure in
   `docs/foundry_agents.md` (Purpose, Inputs, Tools, Outputs,
   Human Approval).
4. Add a CLI flag in `Program.cs` so the agent can be exercised from the
   command line.
