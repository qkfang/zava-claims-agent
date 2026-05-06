@description('App Service Plan name')
param appServicePlanName string

@description('Frontend Web App name')
param frontendAppName string

@description('Backend Web App name')
param backendAppName string

@description('Azure region')
param location string

@description('Resource tags')
param tags object = {}

@description('App Service Plan SKU name')
param skuName string = 'P1v3'

@description('App Service Plan SKU tier')
param skuTier string = 'PremiumV3'

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Application Insights instrumentation key')
param appInsightsInstrumentationKey string

@description('Linux runtime stack for the frontend (src/ui) Web App')
param frontendLinuxFxVersion string = 'NODE|20-lts'

@description('Linux runtime stack for the backend (src/app) Web App')
param backendLinuxFxVersion string = 'DOTNETCORE|10.0'

@description('Startup command for the frontend Web App (serves the static Vite build from /home/site/wwwroot)')
param frontendAppCommandLine string = 'pm2 serve /home/site/wwwroot --no-daemon --spa'

@description('Startup command for the backend Web App (.NET self-contained app entry)')
param backendAppCommandLine string = 'dotnet zc-backend.dll'

@description('Azure AI Foundry project endpoint URL consumed by the backend ClaimsAgent factory')
param projectEndpoint string

@description('Default chat model deployment name (e.g. gpt-5.4)')
param modelDeploymentName string

@description('Tenant ID used by DefaultAzureCredential in the backend')
param tenantId string = tenant().tenantId

@description('Foundry connection ID for the claims knowledge Azure AI Search index (optional)')
param searchConnectionId string = ''

@description('Azure AI Search index name for the claims knowledge base')
param searchIndexName string = 'claims_knowledge'

@description('Foundry project Bing grounding connection ID')
param bingConnectionId string

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

var commonAppSettings = [
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: appInsightsConnectionString
  }
  {
    name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
    value: appInsightsInstrumentationKey
  }
  {
    name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
    value: '~3'
  }
  {
    name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
    value: 'false'
  }
]

resource frontendApp 'Microsoft.Web/sites@2023-12-01' = {
  name: frontendAppName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: frontendLinuxFxVersion
      appCommandLine: frontendAppCommandLine
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: concat(commonAppSettings, [
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'BACKEND_APP_URL'
          value: 'https://${backendApp.properties.defaultHostName}'
        }
      ])
    }
  }
}

resource backendApp 'Microsoft.Web/sites@2023-12-01' = {
  name: backendAppName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: backendLinuxFxVersion
      appCommandLine: backendAppCommandLine
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: concat(commonAppSettings, [
        {
          name: 'ASPNETCORE_ENVIRONMENT'
          value: 'Production'
        }
        {
          name: 'ASPNETCORE_FORWARDEDHEADERS_ENABLED'
          value: 'true'
        }
        {
          name: 'AZURE_AI_PROJECT_ENDPOINT'
          value: projectEndpoint
        }
        {
          name: 'AZURE_AI_MODEL_DEPLOYMENT_NAME'
          value: modelDeploymentName
        }
        {
          name: 'AZURE_TENANT_ID'
          value: tenantId
        }
        {
          name: 'AZURE_AI_SEARCH_CONNECTION_ID'
          value: searchConnectionId
        }
        {
          name: 'AZURE_AI_SEARCH_INDEX_NAME'
          value: searchIndexName
        }
        {
          name: 'AZURE_BING_CONNECTION_ID'
          value: bingConnectionId
        }
      ])
    }
  }
}

output appServicePlanId string = appServicePlan.id
output appServicePlanName string = appServicePlan.name
output frontendAppName string = frontendApp.name
output frontendAppHostName string = frontendApp.properties.defaultHostName
output frontendAppUrl string = 'https://${frontendApp.properties.defaultHostName}'
output frontendPrincipalId string = frontendApp.identity.principalId
output backendAppName string = backendApp.name
output backendAppHostName string = backendApp.properties.defaultHostName
output backendAppUrl string = 'https://${backendApp.properties.defaultHostName}'
output backendPrincipalId string = backendApp.identity.principalId
