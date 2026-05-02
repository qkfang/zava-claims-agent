
az group create --name 'rg-zava-claims' --location 'eastus2'

az deployment group create --name 'zava-claims-deploy' --resource-group 'rg-zava-claims' --template-file './main.bicep' --parameters './main.bicepparam'
