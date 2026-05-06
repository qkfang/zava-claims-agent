using Azure.AI.Projects;
using Azure.Identity;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;
using ZavaClaims.Agents;

namespace ZavaClaims.App.Services;

/// <summary>
/// Factory for the Azure AI Foundry claims agents defined in the
/// <c>agent</c> project. The Blazor app references <c>src/agent</c> as a
/// .NET library and uses this factory to invoke the same agents the CLI
/// host exposes — analogous to how
/// <see href="https://github.com/qkfang/quant-agent/tree/main/src/quantapi">quantapi</see>
/// instantiates <c>QuantAgent</c> subclasses from <c>quantlib</c>.
/// </summary>
public class ClaimsAgentFactory
{
    private readonly ClaimsAgentOptions _options;
    private readonly ILoggerFactory _loggerFactory;
    private readonly Lazy<AIProjectClient> _aiProjectClient;

    public ClaimsAgentFactory(ClaimsAgentOptions options, ILoggerFactory loggerFactory)
    {
        _options = options;
        _loggerFactory = loggerFactory;
        _aiProjectClient = new Lazy<AIProjectClient>(CreateAIProjectClient);
    }

    /// <summary>True when the underlying Foundry connection is configured.</summary>
    public bool IsConfigured => _options.IsConfigured;

    /// <summary>
    /// Create an agent for the given role identifier. The identifier is the
    /// same kebab-case name used by the CLI flags in <c>src/agent</c>
    /// (e.g. <c>intake</c>, <c>assessment</c>, <c>loss-adjuster</c>,
    /// <c>fraud</c>, <c>supplier</c>, <c>settlement</c>,
    /// <c>communications</c>, <c>team-leader</c>).
    /// </summary>
    /// <param name="role">Kebab-case role identifier.</param>
    /// <param name="extraTools">Optional Foundry response tools (e.g. an
    /// MCP tool surface) to wire onto the agent in addition to the default
    /// Azure AI Search and Bing tools.</param>
    public ClaimsAgent Create(string role, IList<ResponseTool>? extraTools = null)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException(
                "Claims agent factory is not configured. Set AZURE_AI_PROJECT_ENDPOINT and " +
                "AZURE_AI_MODEL_DEPLOYMENT_NAME in appsettings.json or environment variables.");
        }

        var client = _aiProjectClient.Value;
        var deployment = _options.ModelDeploymentName!;
        var search = _options.SearchConnectionId;
        var index = _options.SearchIndexName;
        var bing = _options.BingConnectionId;
        var mcpUri = string.IsNullOrWhiteSpace(_options.AppMcpUrl)
            ? null
            : $"{_options.AppMcpUrl!.TrimEnd('/')}/mcp";

        return role.ToLowerInvariant() switch
        {
            "intake" or "claims-intake"
                => new ClaimsIntakeAgent(client, deployment, search, index, bing, _loggerFactory.CreateLogger<ClaimsIntakeAgent>()),
            "assessment" or "claims-assessment"
                => new ClaimsAssessmentAgent(client, deployment, search, index, bing, _loggerFactory.CreateLogger<ClaimsAssessmentAgent>()),
            "loss-adjuster" or "loss-adjusting"
                => new LossAdjusterAgent(client, deployment, search, index, bing, _loggerFactory.CreateLogger<LossAdjusterAgent>(), mcpUri),
            "fraud" or "fraud-investigation"
                => new FraudInvestigationAgent(client, deployment, search, index, bing, _loggerFactory.CreateLogger<FraudInvestigationAgent>()),
            "supplier" or "supplier-coordination"
                => new SupplierCoordinatorAgent(client, deployment, search, index, bing,
                    string.IsNullOrWhiteSpace(_options.AppMcpUrl) ? null : $"{_options.AppMcpUrl!.TrimEnd('/')}/mcp",
                    _loggerFactory.CreateLogger<SupplierCoordinatorAgent>()),
            "settlement"
                => new SettlementAgent(client, deployment, search, index, bing, _loggerFactory.CreateLogger<SettlementAgent>(), extraTools),
            "communications" or "customer-communications"
                => new CustomerCommunicationsAgent(client, deployment, search, index, bing, _loggerFactory.CreateLogger<CustomerCommunicationsAgent>()),
            "team-leader" or "leader"
                => new TeamLeaderAgent(client, deployment, search, index, bing, _loggerFactory.CreateLogger<TeamLeaderAgent>()),
            _ => throw new ArgumentException($"Unknown claims agent role: '{role}'.", nameof(role))
        };
    }

    private AIProjectClient CreateAIProjectClient()
    {
        var credentialOptions = new Azure.Identity.DefaultAzureCredentialOptions
        {
            ExcludeVisualStudioCredential = true,
            ExcludeVisualStudioCodeCredential = true,
            ExcludeSharedTokenCacheCredential = true
        };
        if (!string.IsNullOrWhiteSpace(_options.TenantId))
        {
            credentialOptions.TenantId = _options.TenantId;
        }
        var credential = new Azure.Identity.DefaultAzureCredential(credentialOptions);
        return new AIProjectClient(new Uri(_options.ProjectEndpoint!), credential);
    }
}
