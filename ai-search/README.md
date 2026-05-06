# Azure AI Search — Claims Team in a Day

This folder provisions the Azure AI Search indexes that back the **Claims
Team in a Day** demo for **Zava Insurance** and seeds them with mock
content so every staff-character agent (Intake, Assessment, Loss Adjuster,
Fraud, Supplier, Settlement, Communications, Team Leader) can ground its
answers in realistic claims-office knowledge.

The pattern mirrors the
[quant-agent ai-search](https://github.com/qkfang/quant-agent/tree/main/ai-search)
reference: each `ClaimsAgent` is wired up with the Foundry **Azure AI
Search** tool pointing at the project-level connection created in
`bicep/foundry.bicep`, querying the `claims_knowledge` index by default.

## Indexes

| Index | Purpose |
| --- | --- |
| `claims_knowledge` | Mock claim records, decision notes, fraud patterns, and supplier playbooks the agents cite when answering operator questions. |
| `claims_policy` | Mock Zava Insurance policy requirement / coverage documents (home, motor, travel, business, life) used to check whether a loss is covered. |

Both indexes are created with semantic search and a vector field so they
are forward-compatible with hybrid retrieval, although the demo's
declarative agents use the simple keyword path by default
(`AzureAISearchQueryType.Simple` in `ClaimsAgent.cs`).

## Files

| File | What it does |
| --- | --- |
| `setup-index.ps1` | Creates / updates the two indexes and uploads all JSON documents. Run once after `bicep/main.bicep` has provisioned the search service. |
| `ingest-documents.ps1` | Re-uploads documents from the two folders without recreating the index schemas. Use after editing or adding a JSON file. |
| `claims_knowledge/*.json` | Mock claim case + operations knowledge documents. |
| `claims_policy/*.json` | Mock policy requirement / coverage documents. |

## Prerequisites

* `az login` with an account that has the **Search Index Data Contributor**
  role on the search service (the `principals` array passed to
  `bicep/main.bicep` automatically grants this).
* PowerShell 7+ (`pwsh`).
* Update the `$SearchServiceName` variable at the top of each script to
  match the search service that `main.bicep` deployed (look for the
  `aiSearchName` output, e.g. `srch-zc-abc123`).

## Running

```pwsh
cd ai-search
./setup-index.ps1       # first run: create indexes + upload docs
./ingest-documents.ps1  # subsequent runs: re-upload docs only
```

Once the indexes are populated, the backend Web App reads
`AZURE_AI_SEARCH_CONNECTION_ID` and `AZURE_AI_SEARCH_INDEX_NAME` from app
settings (set by `bicep/appservice.bicep`) and wires the connection into
every Foundry agent created by `ClaimsAgentFactory`.
