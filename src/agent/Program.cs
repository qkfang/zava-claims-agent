using Azure.AI.Projects;
using Azure.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using ZavaClaims.Agents;

// Claims Team in a Day — Zava Insurance — .NET 10 Foundry agents
//
// Each staff character in the Zava Insurance claims office is implemented as a
// specialised Azure AI Foundry declarative agent. This console host lets you
// drive any individual agent from the command line for demo / testing purposes.
//
// Usage:
//   dotnet run -- --intake          "My kitchen flooded after a pipe burst"
//   dotnet run -- --assessment      "Review claim CL-1001 against policy POL-42"
//   dotnet run -- --loss-adjuster   "Inspect water-damage photos for CL-1001"
//   dotnet run -- --fraud           "Check CL-1001 for fraud indicators"
//   dotnet run -- --supplier        "Assign a builder for CL-1001 in 3000"
//   dotnet run -- --settlement      "Calculate settlement for CL-1001"
//   dotnet run -- --communications  "Draft an approval message for CL-1001"
//   dotnet run -- --team-leader     "Summarise today's escalations"

var config = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: false)
    .AddJsonFile("appsettings.Development.json", optional: true)
    .AddEnvironmentVariables()
    .Build();

var endpoint = config["AZURE_AI_PROJECT_ENDPOINT"];
if (string.IsNullOrWhiteSpace(endpoint))
    throw new InvalidOperationException("AZURE_AI_PROJECT_ENDPOINT is not set.");

var deploymentName = config["AZURE_AI_MODEL_DEPLOYMENT_NAME"];
if (string.IsNullOrWhiteSpace(deploymentName))
    throw new InvalidOperationException("AZURE_AI_MODEL_DEPLOYMENT_NAME is not set.");

var tenantId = config["AZURE_TENANT_ID"];

var credentialOptions = new DefaultAzureCredentialOptions
{
    ExcludeVisualStudioCredential = true,
    ExcludeVisualStudioCodeCredential = true,
    ExcludeSharedTokenCacheCredential = true
};
if (!string.IsNullOrWhiteSpace(tenantId))
{
    credentialOptions.TenantId = tenantId;
}
var credential = new DefaultAzureCredential(credentialOptions);
AIProjectClient aiProjectClient = new(new Uri(endpoint), credential);

using var loggerFactory = LoggerFactory.Create(b => b.AddConsole());

var searchConnectionId = config["AZURE_AI_SEARCH_CONNECTION_ID"];
var searchIndexName = config["AZURE_AI_SEARCH_INDEX_NAME"];
var bingConnectionId = config["AZURE_BING_CONNECTION_ID"];

string? flag = args.Length > 0 ? args[0] : null;
string request = args.Length > 1
    ? string.Join(" ", args.Skip(1))
    : "Walk me through how you would handle this claim.";

ClaimsAgent? agent = flag switch
{
    "--intake"
        => new ClaimsIntakeAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, loggerFactory.CreateLogger<ClaimsIntakeAgent>()),
    "--assessment"
        => new ClaimsAssessmentAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, loggerFactory.CreateLogger<ClaimsAssessmentAgent>()),
    "--loss-adjuster"
        => new LossAdjusterAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, loggerFactory.CreateLogger<LossAdjusterAgent>()),
    "--fraud"
        => new FraudInvestigationAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, loggerFactory.CreateLogger<FraudInvestigationAgent>()),
    "--supplier"
        => new SupplierCoordinatorAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, mcpServerUri: null, logger: loggerFactory.CreateLogger<SupplierCoordinatorAgent>()),
    "--settlement"
        => new SettlementAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, loggerFactory.CreateLogger<SettlementAgent>()),
    "--communications"
        => new CustomerCommunicationsAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, loggerFactory.CreateLogger<CustomerCommunicationsAgent>()),
    "--team-leader"
        => new TeamLeaderAgent(aiProjectClient, deploymentName, searchConnectionId, searchIndexName, bingConnectionId, loggerFactory.CreateLogger<TeamLeaderAgent>()),
    _ => null
};

if (agent is null)
{
    PrintUsage();
    return;
}

Console.WriteLine($"{agent.ConsoleColor}--- {agent.Name} ({agent.Role}) — {agent.Department} ---\u001b[0m");
Console.WriteLine($"Request: {request}");
Console.WriteLine();

await foreach (var chunk in agent.RunStreamingAsync(request))
{
    Console.Write(chunk);
}
Console.WriteLine();

static void PrintUsage()
{
    Console.WriteLine("Claims Team in a Day — Zava Insurance — Foundry agents");
    Console.WriteLine();
    Console.WriteLine("Usage:");
    Console.WriteLine("  dotnet run -- --intake          \"<message>\"");
    Console.WriteLine("  dotnet run -- --assessment      \"<message>\"");
    Console.WriteLine("  dotnet run -- --loss-adjuster   \"<message>\"");
    Console.WriteLine("  dotnet run -- --fraud           \"<message>\"");
    Console.WriteLine("  dotnet run -- --supplier        \"<message>\"");
    Console.WriteLine("  dotnet run -- --settlement      \"<message>\"");
    Console.WriteLine("  dotnet run -- --communications  \"<message>\"");
    Console.WriteLine("  dotnet run -- --team-leader     \"<message>\"");
}
