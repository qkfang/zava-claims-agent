# Re-uploads documents from claims_knowledge/ and claims_policy/ into the
# Azure AI Search indexes provisioned by setup-index.ps1. Use this after
# editing or adding mock claim or policy JSON files.

$SearchServiceName = "search-zc"   # Update to the full aiSearchName output from main.bicep, e.g. srch-zc-abc123 (the deployment appends a 6-char unique suffix)
$IndexPrefix = "claims"

$ErrorActionPreference = "Stop"

$searchEndpoint = "https://${SearchServiceName}.search.windows.net"
$apiVersion = "2024-07-01"

$token = (az account get-access-token --resource "https://search.azure.com" --query accessToken -o tsv)
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
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

Write-Host "Ingesting documents into '${IndexPrefix}_knowledge'..."
Upload-Documents -IndexName "${IndexPrefix}_knowledge" -DocumentFolder (Join-Path $scriptDir "claims_knowledge")

Write-Host "Ingesting documents into '${IndexPrefix}_policy'..."
Upload-Documents -IndexName "${IndexPrefix}_policy" -DocumentFolder (Join-Path $scriptDir "claims_policy")

Write-Host "`nDocument ingestion complete."
