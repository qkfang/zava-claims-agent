@description('Base resource name abbreviation for the Zava Claims demo')
param baseName string = 'zc'

@description('Azure region for all resources')
param location string = 'eastus2'

@description('Principal object IDs to grant access to deployed resources')
param principals array = []

var commonTags = {
  SecurityControl: 'Ignore'
}

// Short, deterministic suffix for globally-unique resource names (storage, key vault).
var uniqueSuffix = substring(uniqueString(resourceGroup().id, baseName), 0, 6)

// Standard Azure resource naming using the base abbreviation (e.g. "zc").
var foundryName = 'aif-${baseName}'
var logAnalyticsName = 'log-${baseName}'
var appInsightsName = 'appi-${baseName}'
var storageAccountName = toLower('st${baseName}')
var keyVaultName = 'kv-${baseName}'
var appServicePlanName = 'asp-${baseName}'
var frontendAppName = 'app-${baseName}-frontend'
var backendAppName = 'app-${baseName}-backend'
var docIntelligenceName = 'di-${baseName}'

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
// Azure AI Foundry (Cognitive Services account + project + Codex deployment)
// ---------------------------------------------------------------------------
module foundry 'foundry.bicep' = {
  name: 'foundryDeployment'
  params: {
    name: foundryName
    location: location
    tags: commonTags
  }
}

// ---------------------------------------------------------------------------
// Document Intelligence (Form Recognizer) account
// ---------------------------------------------------------------------------
module docIntelligence 'docintelligence.bicep' = {
  name: 'docIntelligenceDeployment'
  params: {
    name: docIntelligenceName
    location: location
    tags: commonTags
  }
}

resource docIntelligenceAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: docIntelligenceName
  dependsOn: [docIntelligence]
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
    docIntelligenceEndpoint: docIntelligence.outputs.endpoint
  }
}

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-10-01-preview' existing = {
  name: foundryName
  dependsOn: [foundry]
}

var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var azureAIUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'
var azureAIDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'

// ---------------------------------------------------------------------------
// Role assignments: Backend Web App managed identity → Foundry
// ---------------------------------------------------------------------------
resource backendOpenAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, resourceId('Microsoft.Web/sites', backendAppName), cognitiveServicesOpenAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: appService.outputs.backendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource backendAIUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, resourceId('Microsoft.Web/sites', backendAppName), azureAIUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIUserRoleId)
    principalId: appService.outputs.backendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource backendAIDeveloperRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, resourceId('Microsoft.Web/sites', backendAppName), azureAIDeveloperRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAIDeveloperRoleId)
    principalId: appService.outputs.backendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource backendCogServicesUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, resourceId('Microsoft.Web/sites', backendAppName), cognitiveServicesUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: appService.outputs.backendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Role assignment: Backend Web App managed identity → Document Intelligence
// ---------------------------------------------------------------------------
resource backendDocIntelligenceRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(docIntelligenceAccount.id, resourceId('Microsoft.Web/sites', backendAppName), cognitiveServicesUserRoleId)
  scope: docIntelligenceAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: appService.outputs.backendPrincipalId
    principalType: 'ServicePrincipal'
  }
}

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

resource principalCogServicesUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  name: guid(foundryAccount.id, principal.id, cognitiveServicesUserRoleId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
    principalId: principal.id
    principalType: principal.principalType
  }
}]

resource principalDocIntelligenceRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  name: guid(docIntelligenceAccount.id, principal.id, cognitiveServicesUserRoleId)
  scope: docIntelligenceAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
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

output docIntelligenceAccountName string = docIntelligence.outputs.accountName
output docIntelligenceEndpoint string = docIntelligence.outputs.endpoint

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
