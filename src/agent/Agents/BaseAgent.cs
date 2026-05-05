using Azure.AI.Extensions.OpenAI;
using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;
using System.Diagnostics;
using System.Runtime.CompilerServices;

namespace ZavaClaims.Agents;

public record SearchCitation(string Title, string Url);

public record AgentResult(string Text, IReadOnlyList<SearchCitation> Citations);

/// <summary>
/// Tracks an MCP tool call that is awaiting human approval before it can run.
/// Used by the step-style <see cref="BaseAgent.StartRunAsync"/> / <see cref="BaseAgent.ChatAsync"/>
/// / <see cref="BaseAgent.ContinueRunAsync"/> flow ported from the
/// demo-foundry-document-intelligence repo.
/// </summary>
public record PendingToolApproval(string ResponseId, string ApprovalItemId, string ServerLabel);

/// <summary>
/// Result of a single agent step. Either contains the assistant's text result
/// or a pending MCP tool-call approval that must be resolved by the caller.
/// </summary>
public record AgentStepResult(string? Result, PendingToolApproval? Pending, string? ResponseId);

/// <summary>
/// Base wrapper around an Azure AI Foundry declarative agent. Each claims-office
/// staff character is implemented as a subclass of <see cref="ClaimsAgent"/>
/// (which in turn inherits from this <see cref="BaseAgent"/>) so that every
/// agent shares the same response-handling, MCP approval and citation logic.
///
/// Adapted from the BaseAgent pattern in
/// https://github.com/qkfang/quant-agent/tree/main/src/quantlib.
/// </summary>
public abstract class BaseAgent
{
    protected readonly ProjectResponsesClient _responseClient;
    protected readonly ILogger _logger;
    protected readonly string _agentId;

    /// <summary>The Foundry agent id used to create this agent version.</summary>
    public string AgentId => _agentId;

    /// <summary>The system instructions/prompt the agent was created with.</summary>
    public string Instructions { get; }

    protected BaseAgent(AIProjectClient aiProjectClient, string agentId, string deploymentName, string instructions, IList<ResponseTool>? tools = null, ILogger? logger = null)
        : this(aiProjectClient, agentId, deploymentName, instructions, tools, null, logger)
    {
    }

    protected BaseAgent(AIProjectClient aiProjectClient, string agentId, string deploymentName, string instructions, IList<ResponseTool>? tools = null, Action<DeclarativeAgentDefinition>? configureAgent = null, ILogger? logger = null)
    {
        _agentId = agentId;
        Instructions = instructions;
        _logger = logger ?? LoggerFactory.Create(b => b.AddConsole()).CreateLogger(agentId);

        var agentDefinition = new DeclarativeAgentDefinition(model: deploymentName)
        {
            Instructions = instructions
        };

        if (tools != null)
        {
            foreach (var tool in tools)
            {
                if (tool != null)
                    agentDefinition.Tools.Add(tool);
            }
        }

        configureAgent?.Invoke(agentDefinition);

        var agentVersion = aiProjectClient.AgentAdministrationClient.CreateAgentVersion(
            agentId,
            new ProjectsAgentVersionCreationOptions(agentDefinition)).Value;

        _responseClient = aiProjectClient.ProjectOpenAIClient.GetProjectResponsesClientForAgent(agentVersion.Name);
    }

    public async Task<AgentResult> RunAsync(string message, string? conversationId = null)
    {
        var sw = Stopwatch.StartNew();

        CreateResponseOptions? nextOptions = new()
        {
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };
        if (!string.IsNullOrEmpty(conversationId))
            nextOptions.AgentConversationId = conversationId;

        ResponseResult? result = null;

        while (nextOptions is not null)
        {
            result = await _responseClient.CreateResponseAsync(nextOptions);
            nextOptions = null;

            foreach (var item in result!.OutputItems)
            {
                if (item is McpToolCallApprovalRequestItem mcpCall)
                {
                    _logger.LogInformation("Auto-approving MCP tool call on {ServerLabel}", mcpCall.ServerLabel);
                    nextOptions ??= new CreateResponseOptions { PreviousResponseId = result.Id };
                    nextOptions.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(mcpCall.Id, approved: true));
                }
            }
        }

        sw.Stop();
        _logger.LogInformation("Agent {AgentId} completed in {Duration}ms", _agentId, sw.ElapsedMilliseconds);

        var text = result?.GetOutputText() ?? string.Empty;
        var citations = ExtractCitations(result);

        return new AgentResult(text, citations);
    }

    public async IAsyncEnumerable<string> RunStreamingAsync(string message, [EnumeratorCancellation] CancellationToken cancellationToken = default, List<SearchCitation>? citationsOutput = null, string? conversationId = null)
    {
        var sw = Stopwatch.StartNew();

        CreateResponseOptions nextOptions = new()
        {
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };
        if (!string.IsNullOrEmpty(conversationId))
            nextOptions.AgentConversationId = conversationId;

        ResponseResult? completedResponse = null;

        while (true)
        {
            var pendingApprovals = new List<string>();
            completedResponse = null;

            await foreach (var update in _responseClient.CreateResponseStreamingAsync(nextOptions, cancellationToken).WithCancellation(cancellationToken))
            {
                if (update is StreamingResponseOutputTextDeltaUpdate delta)
                    yield return delta.Delta;
                else if (update is StreamingResponseOutputItemDoneUpdate itemDone && itemDone.Item is McpToolCallApprovalRequestItem mcpCall)
                {
                    _logger.LogInformation("Auto-approving MCP tool call on {ServerLabel}", mcpCall.ServerLabel);
                    pendingApprovals.Add(mcpCall.Id);
                }
                else if (update is StreamingResponseCompletedUpdate done)
                    completedResponse = done.Response;
            }

            if (pendingApprovals.Count == 0)
                break;

            nextOptions = new CreateResponseOptions { PreviousResponseId = completedResponse!.Id };
            foreach (var id in pendingApprovals)
                nextOptions.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(id, approved: true));
        }

        sw.Stop();
        _logger.LogInformation("Agent {AgentId} streaming completed in {Duration}ms", _agentId, sw.ElapsedMilliseconds);

        if (citationsOutput != null)
        {
            foreach (var citation in ExtractCitations(completedResponse))
                citationsOutput.Add(citation);
        }
    }

    /// <summary>
    /// Starts a step-style run where the caller is expected to handle MCP tool
    /// approval requests externally (e.g. surface them to a human reviewer in a UI).
    /// Mirrors the StartRunAsync / ChatAsync / ContinueRunAsync flow from the
    /// demo-foundry-document-intelligence repo's BaseAgent.
    /// </summary>
    public Task<AgentStepResult> StartRunAsync(string message)
    {
        var options = new CreateResponseOptions
        {
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };
        return StepAsync(options);
    }

    /// <summary>
    /// Continues a chat after a previous response, sending a new user message.
    /// </summary>
    public Task<AgentStepResult> ChatAsync(string previousResponseId, string message)
    {
        var options = new CreateResponseOptions
        {
            PreviousResponseId = previousResponseId,
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };
        return StepAsync(options);
    }

    /// <summary>
    /// Continues a previously-paused run by responding to a pending MCP tool-call approval.
    /// </summary>
    public Task<AgentStepResult> ContinueRunAsync(string previousResponseId, string approvalItemId, bool approved)
    {
        var options = new CreateResponseOptions
        {
            PreviousResponseId = previousResponseId,
            InputItems = { ResponseItem.CreateMcpApprovalResponseItem(approvalItemId, approved) }
        };
        return StepAsync(options);
    }

    private async Task<AgentStepResult> StepAsync(CreateResponseOptions options)
    {
        ResponseResult result = await _responseClient.CreateResponseAsync(options);

        foreach (var item in result.OutputItems)
        {
            if (item is McpToolCallApprovalRequestItem mcpCall)
            {
                _logger.LogInformation("Awaiting user approval for MCP tool call on {ServerLabel}", mcpCall.ServerLabel);
                return new AgentStepResult(null, new PendingToolApproval(result.Id, mcpCall.Id, mcpCall.ServerLabel), result.Id);
            }
        }

        _logger.LogInformation("Agent {AgentId} step completed", _agentId);
        return new AgentStepResult(result.GetOutputText(), null, result.Id);
    }

    private IReadOnlyList<SearchCitation> ExtractCitations(ResponseResult? result)
    {
        var citations = new List<SearchCitation>();
        if (result is null) return citations;

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in result.OutputItems)
        {
            if (item is not MessageResponseItem messageItem) continue;

            foreach (var part in messageItem.Content)
            {
                if (part.OutputTextAnnotations is null) continue;

                foreach (var annotation in part.OutputTextAnnotations)
                {
                    if (annotation is UriCitationMessageAnnotation uriCitation)
                    {
                        var url = uriCitation.Uri?.ToString() ?? string.Empty;
                        if (!string.IsNullOrEmpty(url) && seen.Add(url))
                        {
                            citations.Add(new SearchCitation(
                                uriCitation.Title ?? string.Empty,
                                url));
                        }
                    }
                    else if (annotation is FileCitationMessageAnnotation fileCitation)
                    {
                        var fileIdentifier = fileCitation.FileId ?? fileCitation.Filename ?? string.Empty;
                        if (!string.IsNullOrEmpty(fileIdentifier) && seen.Add(fileIdentifier))
                        {
                            citations.Add(new SearchCitation(
                                fileCitation.Filename ?? fileCitation.FileId ?? string.Empty,
                                string.Empty));
                        }
                    }
                }
            }
        }

        return citations;
    }
}
