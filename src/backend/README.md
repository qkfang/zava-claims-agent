# Claims Team in a Day — Agent Web App (`src/app`)

A .NET 10 Blazor Server web app for the **Zava Insurance** claims office that gives
every AI agent in [`src/agent/Agents`](../agent/Agents) its own page.

Each page explains:

- The agent's role and persona (mapped to a staff character from `docs/characters.md`).
- The agent's purpose, responsibilities, tools, and human-approval rules.
- Two worked **demo scenarios** showing how the agent helps with a real claim:
  - **Scenario 1 — Michael Harris** (Home insurance, burst pipe / kitchen water damage).
  - **Scenario 2 — Aisha Khan** (Motor insurance, rear-end collision).

For each scenario the page shows:

1. The trigger that wakes the agent (e.g. an inbound email or form submission).
2. The actions the agent performs in order.
3. The handoff to the next agent or human in the claims office.

## Run

```bash
dotnet run --project src/app/app.csproj
```

Then open the URL shown in the console (typically <http://localhost:5212>).

## Routes

- `/` — the claims office landing page with one card per agent.
- `/agents/{id}` — the dedicated page for a given agent.

Valid agent ids:

| Id                          | Department              |
| --------------------------- | ----------------------- |
| `claims-intake`             | Claims Intake           |
| `claims-assessment`         | Claims Assessment       |
| `loss-adjuster`             | Loss Adjusting          |
| `fraud-investigation`       | Fraud Investigation     |
| `supplier-coordinator`      | Supplier Coordination   |
| `settlement`                | Settlement              |
| `customer-communications`   | Customer Communications |
| `team-leader`               | Team Leader Office      |

## Configuration

The app references the [`agent`](../agent) project as a .NET library and uses
the same Azure AI Foundry configuration keys as the CLI host. Set them in
`appsettings.json`, `appsettings.Development.json`, or as environment variables:

| Key | Purpose |
| --- | --- |
| `AZURE_AI_PROJECT_ENDPOINT` | Azure AI Foundry project endpoint URL |
| `AZURE_AI_MODEL_DEPLOYMENT_NAME` | Default chat model deployment (e.g. `gpt-4.1`) |
| `AZURE_TENANT_ID` | Optional tenant ID for `DefaultAzureCredential` |
| `AZURE_AI_SEARCH_CONNECTION_ID` | Foundry connection ID for the claims knowledge base |
| `AZURE_AI_SEARCH_INDEX_NAME` | Azure AI Search index name |
| `AZURE_BING_CONNECTION_ID` | Foundry Bing grounding connection ID |

When these values are set, the app's DI container exposes a
`ClaimsAgentFactory` that constructs the same agents the CLI exposes (see
[`Services/ClaimsAgentFactory.cs`](Services/ClaimsAgentFactory.cs)). Inject
the factory into a Blazor component or service and call
`factory.Create("intake").RunStreamingAsync(message)` — the same pattern
[`quantapi`](https://github.com/qkfang/quant-agent/tree/main/src/quantapi)
uses to invoke `quantlib` agents.

If the configuration is empty, `ClaimsAgentFactory.IsConfigured` is `false`
and the static demo pages still render normally.

## Future work

Once `src/ui` is wired up, the clickable links in the voxel office should
deep-link to `/agents/{id}` so a viewer can step from a department in the
office directly into the agent's demo page. Actually invoking the agents
from these pages is intentionally out of scope for now.
