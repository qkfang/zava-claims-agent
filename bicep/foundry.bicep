@description('Name of the Foundry (AI Services) account')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object = {}

@description('Codex model deployment name (used as the deployment id and as model in Codex config.toml)')
param codexDeploymentName string = 'gpt-5-codex'

@description('Codex model name in the OpenAI catalog')
param codexModelName string = 'gpt-5-codex'

@description('Codex model version')
param codexModelVersion string = '2025-09-15'

@description('Capacity (TPM in thousands) for the Codex deployment')
param codexCapacity int = 100

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

resource codexDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: foundry
  name: codexDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: codexCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: codexModelName
      version: codexModelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

output accountName string = foundry.name
output accountEndpoint string = foundry.properties.endpoint
output projectName string = project.name
output projectEndpoint string = project.properties.endpoints['AI Foundry API']
output deploymentName string = codexDeployment.name
output principalId string = foundry.identity.principalId
