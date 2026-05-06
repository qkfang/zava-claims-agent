@description('Azure AI Search service name')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object = {}

@description('Search service SKU')
param sku string = 'standard'

@description('Replica count')
param replicaCount int = 1

@description('Partition count')
param partitionCount int = 1

// Azure AI Search service backing the claims knowledge + policy requirement
// indexes. Uses AAD-only auth (mirrors the quant-agent reference at
// https://github.com/qkfang/quant-agent/blob/main/bicep/aisearch.bicep) so the
// Foundry account/project and the backend Web App can call it via their
// system-assigned managed identities.
resource searchService 'Microsoft.Search/searchServices@2024-06-01-preview' = {
  name: name
  location: 'westus2'
  tags: union(tags, { securityControl: 'Ignore' })
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: sku
  }
  properties: {
    replicaCount: replicaCount
    partitionCount: partitionCount
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    semanticSearch: 'standard'
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http401WithBearerChallenge'
      }
    }
  }
}

output id string = searchService.id
output name string = searchService.name
output endpoint string = 'https://${searchService.name}.search.windows.net'
output principalId string = searchService.identity.principalId
