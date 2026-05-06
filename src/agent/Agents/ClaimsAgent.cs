using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;

namespace ZavaClaims.Agents;

/// <summary>
/// Shared base for every staff-character agent in the claims office.
///
/// Each agent represents one specialist role from <c>docs/foundry_agents.md</c>
/// and is wired up with the same Foundry tools (Azure AI Search over the
/// claims knowledge base and Bing grounding for external context). This is
/// analogous to <c>QuantAgent</c> in
/// https://github.com/qkfang/quant-agent/tree/main/src/quantlib/Agents/QuantAgent.cs.
/// </summary>
public class ClaimsAgent : BaseAgent
{
    /// <summary>Display name of the staff character (e.g. "Iris").</summary>
    public string Name { get; }

    /// <summary>Department / role (e.g. "Claims Intake Officer").</summary>
    public string Role { get; }

    /// <summary>Department this agent belongs to in the voxel claims office.</summary>
    public string Department { get; }

    /// <summary>ANSI console colour used when streaming the agent's output.</summary>
    public string ConsoleColor { get; }

    /// <summary>
    /// Human-readable list of Foundry tools wired up for this agent based on
    /// the connections that were configured. Surfaced in the "Agent Prompt
    /// &amp; Tools" sub-tab on each agent page.
    /// </summary>
    public IReadOnlyList<string> ConfiguredTools { get; }

    public ClaimsAgent(
        AIProjectClient aiProjectClient,
        string agentId,
        string name,
        string role,
        string department,
        string consoleColor,
        string deploymentName,
        string instructions,
        string? searchConnectionId = null,
        string? searchIndexName = null,
        string? bingConnectionId = null,
        ILogger? logger = null,
        string? mcpServerUri = null,
        string? mcpServerLabel = null)
        : base(aiProjectClient, agentId, deploymentName, instructions, null,
            agentDef =>
            {
                if (!string.IsNullOrWhiteSpace(searchConnectionId) && !string.IsNullOrWhiteSpace(searchIndexName))
                    agentDef.Tools.Add(new AzureAISearchTool(new AzureAISearchToolOptions([
                        new AzureAISearchToolIndex { ProjectConnectionId = searchConnectionId, IndexName = searchIndexName, QueryType = AzureAISearchQueryType.Simple, TopK = 5 }
                    ])));

                if (!string.IsNullOrWhiteSpace(bingConnectionId))
                    agentDef.Tools.Add(new BingGroundingTool(new BingGroundingSearchToolOptions([
                        new BingGroundingSearchConfiguration(bingConnectionId)
                    ])));

                if (!string.IsNullOrWhiteSpace(mcpServerUri))
                {
                    var mcpTool = ResponseTool.CreateMcpTool(
                        serverLabel: mcpServerLabel ?? "zava-claims-mcp",
                        serverUri: new Uri(mcpServerUri),
                        toolCallApprovalPolicy: new McpToolCallApprovalPolicy(GlobalMcpToolCallApprovalPolicy.NeverRequireApproval));
                    agentDef.Tools.Add(mcpTool);
                }
            },
            logger)
    {
        Name = name;
        Role = role;
        Department = department;
        ConsoleColor = consoleColor;

        var tools = new List<string>();
        if (!string.IsNullOrWhiteSpace(searchConnectionId) && !string.IsNullOrWhiteSpace(searchIndexName))
            tools.Add($"Azure AI Search — index '{searchIndexName}'");
        if (!string.IsNullOrWhiteSpace(bingConnectionId))
            tools.Add("Bing Grounding (web)");
        if (!string.IsNullOrWhiteSpace(mcpServerUri))
            tools.Add($"MCP server '{mcpServerLabel ?? "zava-claims-mcp"}' at {mcpServerUri}");
        ConfiguredTools = tools;
    }
}
