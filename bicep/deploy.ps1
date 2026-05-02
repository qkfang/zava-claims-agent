$ErrorActionPreference = 'Stop'

$resourceGroup = 'rg-fdrycodex'
$location = 'eastus2'
$deploymentName = 'fdrycodex-deploy'

az group create --name $resourceGroup --location $location | Out-Null

az deployment group create `
    --name $deploymentName `
    --resource-group $resourceGroup `
    --template-file './main.bicep' `
    --parameters './main.bicepparam'
