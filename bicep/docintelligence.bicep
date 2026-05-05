@description('Name of the Document Intelligence (Form Recognizer) account')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object = {}

resource docIntelligence 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  kind: 'FormRecognizer'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

output accountName string = docIntelligence.name
output resourceId string = docIntelligence.id
output endpoint string = docIntelligence.properties.endpoint
