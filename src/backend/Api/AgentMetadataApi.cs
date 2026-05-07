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
        string[] DefaultTools,
        string[] McpTools);

    // Shared base tools every claims agent gets. Surfaced both in the
    // static "demo" view (defaultTools) and the runtime view
    // (configuredTools) when the corresponding Foundry connection ids
    // are present in configuration.
    private const string SearchToolDescription =
        "Azure AI Search — Zava claims knowledge base (policy wordings, scenarios, supplier directory)";
    private const string BingToolDescription =
        "Bing Grounding — open-web grounding for current-events context";

    private static readonly string[] DefaultTools =
    [
        SearchToolDescription,
        BingToolDescription
    ];

    // Per-role MCP tool surfaces. Each entry is the human-readable label
    // shown in the "Tools available" list in the Agent Prompt & Tools tab.
    // These mirror the [McpServerTool] methods in src/backend/Mcp/*.cs and
    // are appended to the runtime configuredTools list whenever
    // APP_MCP_URL is set so the operator sees exactly which MCP tools the
    // Foundry agent is wired up with.
    private static readonly string[] LossAdjusterMcpTools =
    [
        "MCP · analyzeQuote — fetch and parse a contractor quote document (line items + total)",
        "MCP · compareQuotes — markdown comparison table + Mermaid totals chart + flagged anomalies",
        "MCP · generateClaimExcel — write the claim .xlsx workbook (summary + comparison + recommendations) and return its download URL"
    ];

    private static readonly string[] SupplierMcpToolsList =
    [
        "MCP · lookupSuppliers — Zava approved-network supplier directory with indicative pricing (best-price match)",
        "MCP · generateQuoteRequestPdf — generate a Zava quote-request PDF for the chosen supplier and return the download URL"
    ];

    private static readonly string[] SettlementMcpToolsList =
    [
        "MCP · settlement_validatePayee — confirm payee matches the customer on the claim",
        "MCP · settlement_matchInvoice — match supplier invoice against approved scope",
        "MCP · settlement_checkAuthorityLimit — flag amounts at/above the authority threshold",
        "MCP · settlement_calculateSettlement — transparent payable-amount calculation",
        "MCP · settlement_requestPaymentApproval — raise approval and post Adaptive Card to Microsoft Teams (uses teams_sendApprovalCard)",
        "MCP · settlement_getApprovalStatus — poll the approval state",
        "MCP · settlement_releasePayment — release the payment (gated, requires prior approval)"
    ];

    private static readonly string[] NoMcpTools = Array.Empty<string>();

    private static readonly string[] LossAdjusterDefaultTools =
        DefaultTools.Concat(LossAdjusterMcpTools).ToArray();
    private static readonly string[] SupplierDefaultTools =
        DefaultTools.Concat(SupplierMcpToolsList).ToArray();
    private static readonly string[] SettlementDefaultTools =
        DefaultTools.Concat(SettlementMcpToolsList).ToArray();

    private static readonly Dictionary<string, RoleMetadata> _catalog = new(StringComparer.OrdinalIgnoreCase)
    {
        ["claims-intake"] = new(
            "claims-intake", "Iris", "Claims Intake Officer", "Claims Intake",
            "claims-intake-agent", ClaimsIntakeAgent.Instructions, DefaultTools, NoMcpTools),
        ["claims-assessment"] = new(
            "claims-assessment", "Adam", "Claims Assessor", "Claims Assessment",
            "claims-assessment-agent", ClaimsAssessmentAgent.Instructions, DefaultTools, NoMcpTools),
        ["loss-adjuster"] = new(
            "loss-adjuster", "Lara", "Loss Adjuster", "Loss Adjusting",
            "loss-adjuster-agent", LossAdjusterAgent.Instructions, LossAdjusterDefaultTools, LossAdjusterMcpTools),
        ["fraud"] = new(
            "fraud", "Felix", "Fraud Investigator", "Fraud Investigation",
            "fraud-investigation-agent", FraudInvestigationAgent.Instructions, DefaultTools, NoMcpTools),
        ["supplier"] = new(
            "supplier", "Sam", "Supplier Coordinator", "Supplier Coordination",
            "supplier-coordination-agent", SupplierCoordinatorAgent.Instructions, SupplierDefaultTools, SupplierMcpToolsList),
        ["settlement"] = new(
            "settlement", "Seth", "Settlement Officer", "Settlement",
            "settlement-agent", SettlementAgent.Instructions, SettlementDefaultTools, SettlementMcpToolsList),
        ["communications"] = new(
            "communications", "Cara", "Customer Communications Specialist", "Customer Communications",
            "customer-communications-agent", CustomerCommunicationsAgent.Instructions, DefaultTools, NoMcpTools),
        ["team-leader"] = new(
            "team-leader", "Theo", "Claims Team Leader", "Team Leader Office",
            "team-leader-agent", TeamLeaderAgent.Instructions, DefaultTools, NoMcpTools),
    };

    public static void MapAgentMetadataEndpoints(this WebApplication app, ClaimsAgentOptions options)
    {
        app.MapGet("/agents/{role}/metadata", (string role) =>
        {
            if (!_catalog.TryGetValue(role, out var m))
                return Results.NotFound(new { error = $"Unknown agent role '{role}'." });

            // Build the live runtime view of which tools the agent has
            // wired up given the current configuration. This drives the
            // "Tools available" list shown in the Agent Prompt & Tools
            // sub-tab. When APP_MCP_URL is set, the role's MCP tool
            // surface is also appended so the operator can see every
            // [McpServerTool] the Foundry agent can call.
            var configuredTools = new List<string>();
            if (!string.IsNullOrWhiteSpace(options.SearchConnectionId) && !string.IsNullOrWhiteSpace(options.SearchIndexName))
                configuredTools.Add($"Azure AI Search — index '{options.SearchIndexName}'");
            if (!string.IsNullOrWhiteSpace(options.BingConnectionId))
                configuredTools.Add("Bing Grounding (web)");
            if (!string.IsNullOrWhiteSpace(options.AppMcpUrl) && m.McpTools.Length > 0)
                configuredTools.AddRange(m.McpTools);

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
                mcpTools = m.McpTools,
                mcpConfigured = !string.IsNullOrWhiteSpace(options.AppMcpUrl) && m.McpTools.Length > 0,
                isConfigured = options.IsConfigured
            });
        });
    }
}
