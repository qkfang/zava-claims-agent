# Creates / updates the two Azure AI Search indexes used by Claims Team in a Day
# (Zava Insurance) and uploads the mock JSON documents from the sibling folders.
# Adapted from https://github.com/qkfang/quant-agent/blob/main/ai-search/setup-index.ps1.

$SearchServiceName = "srch-zc"            # Update to the full aiSearchName output from main.bicep, e.g. srch-zc-abc123 (the deployment appends a 6-char unique suffix)
$ResourceGroupName = "rg-zava-claims"
$IndexPrefix = "claims"
$FoundryEndpoint = "https://aif-zc.cognitiveservices.azure.com"  # Update to match foundryAccountEndpoint output

$ErrorActionPreference = "Stop"

$searchEndpoint = "https://${SearchServiceName}.search.windows.net"
$apiVersion = "2024-07-01"

# Get an AAD bearer token for Azure AI Search (the search service is configured
# with aadOrApiKey + http401WithBearerChallenge in aisearch.bicep).
$token = (az account get-access-token --resource "https://search.azure.com" --query accessToken -o tsv)
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

function New-SearchIndex {
    param([string]$IndexName, [object]$IndexDefinition)

    Write-Host "Creating index: $IndexName"
    $IndexDefinition.name = $IndexName
    $body = $IndexDefinition | ConvertTo-Json -Depth 30

    $uri = "$searchEndpoint/indexes/${IndexName}?api-version=$apiVersion"
    try {
        Invoke-RestMethod -Uri $uri -Method Put -Headers $headers -Body $body
        Write-Host "  Index '$IndexName' created/updated."
    }
    catch {
        Write-Warning "  Failed to create index '$IndexName': $_"
    }
}

function Upload-Documents {
    param([string]$IndexName, [string]$DocumentFolder)

    $files = Get-ChildItem -Path $DocumentFolder -Filter "*.json"
    if ($files.Count -eq 0) {
        Write-Host "  No JSON documents found in $DocumentFolder"
        return
    }

    $docs = @()
    foreach ($file in $files) {
        $doc = Get-Content $file.FullName -Raw | ConvertFrom-Json
        $doc | Add-Member -NotePropertyName "@search.action" -NotePropertyValue "upload" -Force
        $docs += $doc
    }

    $body = @{ value = $docs } | ConvertTo-Json -Depth 20
    $uri = "$searchEndpoint/indexes/${IndexName}/docs/index?api-version=$apiVersion"

    try {
        Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body
        Write-Host "  Uploaded $($docs.Count) documents to '$IndexName'."
    }
    catch {
        Write-Warning "  Failed to upload documents to '$IndexName': $_"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- claims_knowledge index ------------------------------------------------
# Mock claim case records, decision notes, fraud signals, supplier playbooks.
$knowledgeIndexName = "${IndexPrefix}_knowledge"
$knowledgeIndexDef = @{
    name   = $knowledgeIndexName
    fields = @(
        @{ name = "id"; type = "Edm.String"; key = $true; filterable = $true }
        @{ name = "title"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $true; analyzer = "en.microsoft" }
        @{ name = "category"; type = "Edm.String"; searchable = $true; filterable = $true; facetable = $true }
        @{ name = "claimType"; type = "Edm.String"; filterable = $true; facetable = $true }
        @{ name = "claimNumber"; type = "Edm.String"; filterable = $true; searchable = $true }
        @{ name = "policyNumber"; type = "Edm.String"; filterable = $true; searchable = $true }
        @{ name = "content"; type = "Edm.String"; searchable = $true; analyzer = "en.microsoft" }
        @{ name = "severity"; type = "Edm.String"; filterable = $true; facetable = $true }
        @{ name = "department"; type = "Edm.String"; filterable = $true; facetable = $true }
        @{ name = "tags"; type = "Collection(Edm.String)"; searchable = $true; filterable = $true; facetable = $true }
        @{ name = "lastUpdated"; type = "Edm.DateTimeOffset"; filterable = $true; sortable = $true }
        @{ name = "contentVector"; type = "Collection(Edm.Single)"; searchable = $true; dimensions = 1536; vectorSearchProfile = "vector-profile-knowledge" }
    )
    vectorSearch = @{
        algorithms = @(
            @{
                name = "hnsw-algorithm"
                kind = "hnsw"
                hnswParameters = @{
                    m = 4
                    efConstruction = 400
                    efSearch = 500
                    metric = "cosine"
                }
            }
        )
        profiles = @(
            @{
                name = "vector-profile-knowledge"
                algorithm = "hnsw-algorithm"
                vectorizer = "openai-vectorizer"
            }
        )
        vectorizers = @(
            @{
                name = "openai-vectorizer"
                kind = "azureOpenAI"
                azureOpenAIParameters = @{
                    resourceUri = $FoundryEndpoint
                    deploymentId = "text-embedding-ada-002"
                    modelName = "text-embedding-ada-002"
                }
            }
        )
    }
    semantic = @{
        defaultConfiguration = "semantic-config-knowledge"
        configurations = @(
            @{
                name = "semantic-config-knowledge"
                prioritizedFields = @{
                    titleField = @{ fieldName = "title" }
                    prioritizedContentFields = @(
                        @{ fieldName = "content" }
                    )
                    prioritizedKeywordsFields = @(
                        @{ fieldName = "category" }
                        @{ fieldName = "claimType" }
                        @{ fieldName = "department" }
                    )
                }
            }
        )
    }
}

New-SearchIndex -IndexName $knowledgeIndexName -IndexDefinition $knowledgeIndexDef
Upload-Documents -IndexName $knowledgeIndexName -DocumentFolder (Join-Path $scriptDir "claims_knowledge")

# --- claims_policy index ---------------------------------------------------
# Mock Zava Insurance policy requirement / coverage documents.
$policyIndexName = "${IndexPrefix}_policy"
$policyIndexDef = @{
    name   = $policyIndexName
    fields = @(
        @{ name = "id"; type = "Edm.String"; key = $true; filterable = $true }
        @{ name = "policyName"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $true; analyzer = "en.microsoft" }
        @{ name = "productLine"; type = "Edm.String"; filterable = $true; facetable = $true }
        @{ name = "version"; type = "Edm.String"; filterable = $true }
        @{ name = "summary"; type = "Edm.String"; searchable = $true; analyzer = "en.microsoft" }
        @{ name = "coverage"; type = "Edm.String"; searchable = $true; analyzer = "en.microsoft" }
        @{ name = "exclusions"; type = "Edm.String"; searchable = $true; analyzer = "en.microsoft" }
        @{ name = "evidenceRequired"; type = "Collection(Edm.String)"; searchable = $true; filterable = $true; facetable = $true }
        @{ name = "owner"; type = "Edm.String"; filterable = $true }
        @{ name = "tags"; type = "Collection(Edm.String)"; searchable = $true; filterable = $true; facetable = $true }
        @{ name = "lastUpdated"; type = "Edm.DateTimeOffset"; filterable = $true; sortable = $true }
        @{ name = "summaryVector"; type = "Collection(Edm.Single)"; searchable = $true; dimensions = 1536; vectorSearchProfile = "vector-profile-policy" }
    )
    vectorSearch = @{
        algorithms = @(
            @{
                name = "hnsw-algorithm"
                kind = "hnsw"
                hnswParameters = @{
                    m = 4
                    efConstruction = 400
                    efSearch = 500
                    metric = "cosine"
                }
            }
        )
        profiles = @(
            @{
                name = "vector-profile-policy"
                algorithm = "hnsw-algorithm"
                vectorizer = "openai-vectorizer"
            }
        )
        vectorizers = @(
            @{
                name = "openai-vectorizer"
                kind = "azureOpenAI"
                azureOpenAIParameters = @{
                    resourceUri = $FoundryEndpoint
                    deploymentId = "text-embedding-ada-002"
                    modelName = "text-embedding-ada-002"
                }
            }
        )
    }
    semantic = @{
        defaultConfiguration = "semantic-config-policy"
        configurations = @(
            @{
                name = "semantic-config-policy"
                prioritizedFields = @{
                    titleField = @{ fieldName = "policyName" }
                    prioritizedContentFields = @(
                        @{ fieldName = "summary" }
                        @{ fieldName = "coverage" }
                        @{ fieldName = "exclusions" }
                    )
                    prioritizedKeywordsFields = @(
                        @{ fieldName = "productLine" }
                        @{ fieldName = "owner" }
                    )
                }
            }
        )
    }
}

New-SearchIndex -IndexName $policyIndexName -IndexDefinition $policyIndexDef
Upload-Documents -IndexName $policyIndexName -DocumentFolder (Join-Path $scriptDir "claims_policy")

Write-Host "`nSetup complete. Indexes '${IndexPrefix}_knowledge' and '${IndexPrefix}_policy' created with semantic search and vector search enabled."
