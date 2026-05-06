namespace ZavaClaims.App.Services;

/// <summary>
/// Configuration values needed to construct Azure AI Foundry claims agents
/// from <c>src/agent</c>. These keys are read from the app's
/// <c>appsettings.json</c> / environment variables and mirror the keys used
/// by the standalone agent CLI.
/// </summary>
public class ClaimsAgentOptions
{
    public string? ProjectEndpoint { get; set; }
    public string? ModelDeploymentName { get; set; }
    public string? TenantId { get; set; }
    public string? SearchConnectionId { get; set; }
    public string? SearchIndexName { get; set; }
    public string? BingConnectionId { get; set; }

    /// <summary>
    /// Public URL Foundry should use to reach this app's MCP endpoint
    /// (<c>/mcp</c>). When set, agents that opt-in (e.g. the Supplier
    /// Coordinator) will be wired with an MCP tool against this URL.
    /// </summary>
    public string? AppMcpUrl { get; set; }

    /// <summary>
    /// Returns true when the minimum configuration required to instantiate a
    /// Foundry agent is present (project endpoint + model deployment name).
    /// </summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ProjectEndpoint) &&
        !string.IsNullOrWhiteSpace(ModelDeploymentName);
}
