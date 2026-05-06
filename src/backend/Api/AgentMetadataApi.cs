using ZavaClaims.Agents;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

/// <summary>
/// Lightweight read-only endpoint that powers the "Agent Prompt &amp; Tools"
/// sub-tab on every agent page. Returns the system instructions the
/// Foundry agent is created with, plus the list of tools the agent has
/// access to in the current environment. Does not require Foundry to be
/// configured — instructions are static <c>const</c> strings on each
/// agent class.
/// </summary>
public static class AgentMetadataApi
{
    private record RoleMetadata(
        string RoleId,
        string Name,
        string Role,
        string Department,
        string AgentId,
        string Instructions,
        string[] DefaultTools);

    private static readonly string[] DefaultTools =
    [
        "Azure AI Search — Zava claims knowledge base (policy wordings, scenarios, supplier directory)",
        "Bing Grounding — open-web grounding for current-events context"
    ];

    private static readonly string[] SettlementTools =
    [
        "Azure AI Search — Zava claims knowledge base (policy wordings, scenarios, supplier directory)",
        "Bing Grounding — open-web grounding for current-events context",
        "MCP · settlement_validatePayee — confirm payee matches the customer on the claim",
        "MCP · settlement_matchInvoice — match supplier invoice against approved scope",
        "MCP · settlement_checkAuthorityLimit — flag amounts at/above the authority threshold",
        "MCP · settlement_calculateSettlement — transparent payable-amount calculation",
        "MCP · settlement_requestPaymentApproval — raise approval and post Adaptive Card to Microsoft Teams",
        "MCP · settlement_getApprovalStatus — poll the approval state",
        "MCP · settlement_releasePayment — release the payment (gated, requires prior approval)"
    ];

    private static readonly Dictionary<string, RoleMetadata> _catalog = new(StringComparer.OrdinalIgnoreCase)
    {
        ["claims-intake"] = new(
            "claims-intake", "Iris", "Claims Intake Officer", "Claims Intake",
            "claims-intake-agent", ClaimsIntakeAgent.Instructions, DefaultTools),
        ["claims-assessment"] = new(
            "claims-assessment", "Adam", "Claims Assessor", "Claims Assessment",
            "claims-assessment-agent", ClaimsAssessmentAgent.Instructions, DefaultTools),
        ["loss-adjuster"] = new(
            "loss-adjuster", "Lara", "Loss Adjuster", "Loss Adjusting",
            "loss-adjuster-agent", LossAdjusterAgent.Instructions, DefaultTools),
        ["fraud"] = new(
            "fraud", "Felix", "Fraud Investigator", "Fraud Investigation",
            "fraud-investigation-agent", FraudInvestigationAgent.Instructions, DefaultTools),
        ["supplier"] = new(
            "supplier", "Sam", "Supplier Coordinator", "Supplier Coordination",
            "supplier-coordination-agent", SupplierCoordinatorAgent.Instructions, DefaultTools),
        ["settlement"] = new(
            "settlement", "Seth", "Settlement Officer", "Settlement",
            "settlement-agent", SettlementAgent.Instructions, SettlementTools),
        ["communications"] = new(
            "communications", "Cara", "Customer Communications Specialist", "Customer Communications",
            "customer-communications-agent", CustomerCommunicationsAgent.Instructions, DefaultTools),
        ["team-leader"] = new(
            "team-leader", "Theo", "Claims Team Leader", "Team Leader Office",
            "team-leader-agent", TeamLeaderAgent.Instructions, DefaultTools),
    };

    public static void MapAgentMetadataEndpoints(this WebApplication app, ClaimsAgentOptions options)
    {
        app.MapGet("/agents/{role}/metadata", (string role) =>
        {
            if (!_catalog.TryGetValue(role, out var m))
                return Results.NotFound(new { error = $"Unknown agent role '{role}'." });

            var configuredTools = new List<string>();
            if (!string.IsNullOrWhiteSpace(options.SearchConnectionId) && !string.IsNullOrWhiteSpace(options.SearchIndexName))
                configuredTools.Add($"Azure AI Search — index '{options.SearchIndexName}'");
            if (!string.IsNullOrWhiteSpace(options.BingConnectionId))
                configuredTools.Add("Bing Grounding (web)");

            return Results.Ok(new
            {
                roleId = m.RoleId,
                name = m.Name,
                role = m.Role,
                department = m.Department,
                agentId = m.AgentId,
                modelDeployment = options.ModelDeploymentName ?? string.Empty,
                instructions = m.Instructions,
                defaultTools = m.DefaultTools,
                configuredTools = configuredTools,
                isConfigured = options.IsConfigured
            });
        });
    }
}
