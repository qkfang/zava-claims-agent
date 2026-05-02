@description('Name of the Foundry (AI Services) account')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object = {}

resource foundry 'Microsoft.CognitiveServices/accounts@2025-10-01-preview' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  kind: 'AIServices'
  properties: {
    allowProjectManagement: true
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: '${name}-project'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
}

resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: foundry
  name: 'gpt-5.4'
  sku: {
    name: 'GlobalStandard'
    capacity: 100
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-5.4'
      version: '2026-03-05'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

resource bingAccount 'Microsoft.Bing/accounts@2020-06-10' = {
  name: '${name}-bing'
  location: 'global'
  tags: tags
  kind: 'Bing.Grounding'
  sku: {
    name: 'G1'
  }
}

#disable-next-line BCP081
resource bingSearchConnection 'Microsoft.CognitiveServices/accounts/connections@2025-10-01-preview' = {
  parent: foundry
  name: '${name}-bingsearchconnection'
  properties: {
    authType: 'ApiKey'
    category: 'GroundingWithBingSearch'
    target: 'https://api.bing.microsoft.com/'
    credentials: {
      key: bingAccount.listKeys().key1
    }
    metadata: {
      displayName: '${name}-bing'
      type: 'bing_grounding'
      ApiType: 'Azure'
      ResourceId: bingAccount.id
    }
  }
}

#disable-next-line BCP081
resource bingSearchProjectConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-10-01-preview' = {
  parent: project
  name: '${name}-bingsearchconnection'
  properties: {
    authType: 'ApiKey'
    category: 'GroundingWithBingSearch'
    target: 'https://api.bing.microsoft.com/'
    credentials: {
      key: bingAccount.listKeys().key1
    }
    metadata: {
      displayName: '${name}-bing'
      type: 'bing_grounding'
      ApiType: 'Azure'
      ResourceId: bingAccount.id
    }
  }
}

output accountName string = foundry.name
output accountEndpoint string = foundry.properties.endpoint
output projectName string = project.name
output projectEndpoint string = project.properties.endpoints['AI Foundry API']
output deploymentName string = modelDeployment.name
output principalId string = foundry.identity.principalId
output bingAccountName string = bingAccount.name
output bingProjectConnectionId string = bingSearchProjectConnection.id
