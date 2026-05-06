@description('Base resource name abbreviation for the Zava Claims demo')
param baseName string = 'zc'

@description('Azure region for all resources')
param location string = 'eastus2'

@description('Principal object IDs to grant access to deployed resources')
param principals array = []

var commonTags = {
  workload: 'zava-claims-agent'
  demo: 'claims-office'
}

// Short, deterministic suffix for globally-unique resource names (storage, key vault).
var uniqueSuffix = substring(uniqueString(resourceGroup().id, baseName), 0, 6)

// Standard Azure resource naming using the base abbreviation (e.g. "zc").
var foundryName = 'aif-${baseName}'
var aiSearchName = toLower('search-${baseName}')
var logAnalyticsName = 'log-${baseName}'
var appInsightsName = 'appi-${baseName}'
var storageAccountName = toLower('st${baseName}')
var keyVaultName = 'kv-${baseName}'
var appServicePlanName = 'asp-${baseName}'
var frontendAppName = 'app-${baseName}-frontend'
var backendAppName = 'app-${baseName}-backend'

// ---------------------------------------------------------------------------
// Monitoring (Log Analytics + Application Insights)
// ---------------------------------------------------------------------------
module monitoring 'monitoring.bicep' = {
  name: 'monitoringDeployment'
  params: {
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
    location: location
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// Storage Account
// ---------------------------------------------------------------------------
module storage 'storage.bicep' = {
  name: 'storageDeployment'
  params: {
    name: storageAccountName
    location: location
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// Key Vault
// ---------------------------------------------------------------------------
module keyVault 'keyvault.bicep' = {
  name: 'keyVaultDeployment'
  params: {
    name: keyVaultName
    location: location
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// Azure AI Search (claims knowledge + policy requirement indexes)
// ---------------------------------------------------------------------------
module aiSearch 'aisearch.bicep' = {
  name: 'aiSearchDeployment'
  params: {
    name: aiSearchName
    location: location
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// Azure AI Foundry (Cognitive Services account + project + Codex deployment)
// ---------------------------------------------------------------------------
module foundry 'foundry.bicep' = {
  name: 'foundryDeployment'
  params: {
    name: foundryName
    location: location
    tags: commonTags
    aiSearchEndpoint: aiSearch.outputs.endpoint
    aiSearchResourceId: aiSearch.outputs.id
  }
}

// ---------------------------------------------------------------------------
// App Service Plan (P1v3) shared by frontend and backend Web Apps
// ---------------------------------------------------------------------------
module appService 'appservice.bicep' = {
  name: 'appServiceDeployment'
  params: {
    appServicePlanName: appServicePlanName
    frontendAppName: frontendAppName
    backendAppName: backendAppName
    location: location
    tags: commonTags
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    appInsightsInstrumentationKey: monitoring.outputs.appInsightsInstrumentationKey
    projectEndpoint: foundry.outputs.projectEndpoint
    modelDeploymentName: foundry.outputs.deploymentName
    bingConnectionId: foundry.outputs.bingProjectConnectionId
    searchConnectionId: foundry.outputs.aiSearchProjectConnectionId
    searchIndexName: 'claims_knowledge'
  }
}

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-10-01-preview' existing = {
  name: foundryName
  dependsOn: [foundry]
}

var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var azureAIUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'
var azureAIDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'

resource principalOpenAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  name: guid(foundryAccount.id, principal.id, cognitiveServicesOpenAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

resource principalAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  name: guid(foundryAccount.id, principal.id, azureAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIUserRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

resource principalAIDeveloperRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  name: guid(foundryAccount.id, principal.id, azureAIDeveloperRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIDeveloperRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

// ---------------------------------------------------------------------------
// Role assignments for Azure AI Search access
//
// Web App (frontend + backend) → Search Index Data Contributor (so the apps
//   can read/write documents directly when needed)
// Foundry account & project managed identities → Search Index Data Reader +
//   Search Service Contributor (so the AzureAISearchTool wired into each
//   ClaimsAgent can issue queries against the claims_knowledge index using
//   the Foundry-side managed identity)
// User principals → Search Index Data Contributor (operators running the
//   ai-search/setup-index.ps1 / ingest-documents.ps1 helper scripts)
// ---------------------------------------------------------------------------
var searchIndexDataReaderRoleId = '1407120a-92aa-4202-b7e9-c0e197c71c8f'
var searchIndexDataContributorRoleId = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
var searchServiceContributorRoleId = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'

resource searchResource 'Microsoft.Search/searchServices@2024-06-01-preview' existing = {
  name: aiSearchName
  dependsOn: [aiSearch]
}

resource foundrySearchIndexDataReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchResource.id, foundryName, searchIndexDataReaderRoleId)
  scope: searchResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRoleId)
    principalId: foundry.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource foundrySearchServiceContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchResource.id, foundryName, searchServiceContributorRoleId)
  scope: searchResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
    principalId: foundry.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource foundryProjectSearchIndexDataReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchResource.id, '${foundryName}-project', searchIndexDataReaderRoleId)
  scope: searchResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRoleId)
    principalId: foundry.outputs.projectPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource foundryProjectSearchServiceContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchResource.id, '${foundryName}-project', searchServiceContributorRoleId)
  scope: searchResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
    principalId: foundry.outputs.projectPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource backendSearchIndexDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchResource.id, backendAppName, searchIndexDataContributorRoleId)
  scope: searchResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
    principalId: appService.outputs.backendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource frontendSearchIndexDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchResource.id, frontendAppName, searchIndexDataContributorRoleId)
  scope: searchResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
    principalId: appService.outputs.frontendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource principalSearchIndexDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  name: guid(searchResource.id, principal.id, searchIndexDataContributorRoleId)
  scope: searchResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output foundryAccountName string = foundry.outputs.accountName
output foundryAccountEndpoint string = foundry.outputs.accountEndpoint
output projectName string = foundry.outputs.projectName
output projectEndpoint string = foundry.outputs.projectEndpoint
output codexDeploymentName string = foundry.outputs.deploymentName

output appServicePlanName string = appService.outputs.appServicePlanName
output frontendAppName string = appService.outputs.frontendAppName
output frontendAppHostName string = appService.outputs.frontendAppHostName
output frontendAppUrl string = appService.outputs.frontendAppUrl
output backendAppName string = appService.outputs.backendAppName
output backendAppHostName string = appService.outputs.backendAppHostName
output backendAppUrl string = appService.outputs.backendAppUrl

output storageAccountName string = storage.outputs.storageAccountName
output keyVaultName string = keyVault.outputs.keyVaultName
output keyVaultUri string = keyVault.outputs.keyVaultUri
output appInsightsName string = monitoring.outputs.appInsightsName
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
output logAnalyticsName string = monitoring.outputs.logAnalyticsName

output aiSearchName string = aiSearch.outputs.name
output aiSearchEndpoint string = aiSearch.outputs.endpoint
output aiSearchIndexName string = 'claims_knowledge'
output aiSearchProjectConnectionId string = foundry.outputs.aiSearchProjectConnectionId
