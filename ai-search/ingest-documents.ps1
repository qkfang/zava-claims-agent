# Re-uploads documents from claims_knowledge/ and claims_policy/ into the
# Azure AI Search indexes provisioned by setup-index.ps1. Use this after
# editing or adding mock claim or policy JSON files.
#
# What it does:
#   1. Validates every *.json file under each folder before upload (fail-fast
#      JSON parse + required-field check), so a malformed mock document
#      can't quietly take down a whole index batch.
#   2. Echoes each file as it is uploaded with its document id so you can
#      cross-reference the new mock documents (e.g. policy-schedule-motor-77881).
#   3. Prints a per-index summary at the end (count and any individual
#      document failures returned by the indexer in the merge response).

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

# Required fields per index — kept in sync with setup-index.ps1. Used as a
# pre-flight sanity check so a mock doc with a typo in (say) `id` doesn't
# silently land as a partial document.
$requiredFields = @{
    "${IndexPrefix}_knowledge" = @("id", "title", "category", "claimType", "content", "tags", "lastUpdated")
    "${IndexPrefix}_policy"    = @("id", "policyName", "productLine", "summary", "coverage", "tags", "lastUpdated")
}

function Read-AndValidateDocument {
    param([System.IO.FileInfo]$File, [string[]]$Required)

    try {
        $doc = Get-Content $File.FullName -Raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Write-Warning "    [SKIP] $($File.Name) — invalid JSON: $($_.Exception.Message)"
        return $null
    }

    $missing = @()
    foreach ($field in $Required) {
        if (-not ($doc.PSObject.Properties.Name -contains $field)) {
            $missing += $field
        }
    }
    if ($missing.Count -gt 0) {
        Write-Warning "    [SKIP] $($File.Name) — missing required field(s): $($missing -join ', ')"
        return $null
    }

    return $doc
}

function Upload-Documents {
    param([string]$IndexName, [string]$DocumentFolder)

    Write-Host "  Source folder: $DocumentFolder"
    $files = Get-ChildItem -Path $DocumentFolder -Filter "*.json" | Sort-Object Name
    if ($files.Count -eq 0) {
        Write-Host "  No JSON documents found in $DocumentFolder"
        return
    }

    $required = $requiredFields[$IndexName]
    if (-not $required) { $required = @("id") }

    $docs = @()
    foreach ($file in $files) {
        $doc = Read-AndValidateDocument -File $file -Required $required
        if ($null -eq $doc) { continue }

        $docId = $doc.id
        Write-Host ("    [OK]   {0,-46}  -> id: {1}" -f $file.Name, $docId)

        $doc | Add-Member -NotePropertyName "@search.action" -NotePropertyValue "upload" -Force
        $docs += $doc
    }

    if ($docs.Count -eq 0) {
        Write-Warning "  No valid documents to upload to '$IndexName'."
        return
    }

    $body = @{ value = $docs } | ConvertTo-Json -Depth 20
    $uri = "$searchEndpoint/indexes/${IndexName}/docs/index?api-version=$apiVersion"

    try {
        $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body

        $succeeded = @($response.value | Where-Object { $_.status -eq $true }).Count
        $failed    = @($response.value | Where-Object { $_.status -ne $true })

        Write-Host "  Uploaded $succeeded / $($docs.Count) documents to '$IndexName'."
        if ($failed.Count -gt 0) {
            foreach ($f in $failed) {
                Write-Warning "    [FAIL] id=$($f.key) statusCode=$($f.statusCode) error=$($f.errorMessage)"
            }
        }
    }
    catch {
        Write-Warning "  Failed to upload documents to '$IndexName': $_"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Ingesting documents into '${IndexPrefix}_knowledge'..."
Upload-Documents -IndexName "${IndexPrefix}_knowledge" -DocumentFolder (Join-Path $scriptDir "claims_knowledge")

Write-Host "`nIngesting documents into '${IndexPrefix}_policy'..."
Upload-Documents -IndexName "${IndexPrefix}_policy" -DocumentFolder (Join-Path $scriptDir "claims_policy")

Write-Host "`nDocument ingestion complete."
