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
      version: '2025-09-15'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

output accountName string = foundry.name
output accountEndpoint string = foundry.properties.endpoint
output projectName string = project.name
output projectEndpoint string = project.properties.endpoints['AI Foundry API']
output deploymentName string = modelDeployment.name
output principalId string = foundry.identity.principalId
