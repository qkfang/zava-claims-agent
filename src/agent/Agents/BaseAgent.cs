using Azure.AI.Extensions.OpenAI;
using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;
using System.ClientModel.Primitives;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

namespace ZavaClaims.Agents;

public record SearchCitation(string Title, string Url);

public record AgentResult(string Text, IReadOnlyList<SearchCitation> Citations);

/// <summary>
/// Discriminated event yielded by <see cref="BaseAgent.RunStreamingTraceAsync"/>.
/// Subclasses are <see cref="AgentStreamingDelta"/> (one or more incremental
/// text chunks as the model produces them) and <see cref="AgentStreamingCompleted"/>
/// (yielded exactly once at the end with the full <see cref="AgentTraceResult"/>).
/// </summary>
public abstract record AgentStreamingEvent;
public sealed record AgentStreamingDelta(string Text) : AgentStreamingEvent;
public sealed record AgentStreamingCompleted(AgentTraceResult Trace) : AgentStreamingEvent;

/// <summary>
/// Detailed trace of a single <see cref="BaseAgent.RunAsync(string, string?)"/>
/// invocation. Used by the "Engage Agent" sub-tab UI to show the operator
/// the exact prompt that was sent, every output item the model produced
/// (assistant messages, MCP tool-call approval requests, etc.) and the
/// final extracted text and citations.
/// </summary>
public record AgentTraceResult(
    string Input,
    string Text,
    IReadOnlyList<SearchCitation> Citations,
    IReadOnlyList<JsonElement> OutputItems,
    string? ResponseId,
    long DurationMs);

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
        var trace = await RunWithTraceAsync(message, conversationId);
        return new AgentResult(trace.Text, trace.Citations);
    }

    /// <summary>
    /// Runs the agent and returns a detailed trace including the prompt, every
    /// output item produced (message parts, MCP tool-call approvals, etc.) and
    /// the final extracted text + citations. Powers the "Engage Agent" sub-tab
    /// UI on each agent page so operators can see what the agent actually saw
    /// and produced — analogous to the Foundry portal's response inspector.
    /// </summary>
    public async Task<AgentTraceResult> RunWithTraceAsync(string message, string? conversationId = null)
    {
        var sw = Stopwatch.StartNew();

        CreateResponseOptions? nextOptions = new()
        {
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };
        if (!string.IsNullOrEmpty(conversationId))
            nextOptions.AgentConversationId = conversationId;

        ResponseResult? result = null;
        var allOutputItems = new List<ResponseItem>();

        while (nextOptions is not null)
        {
            result = await _responseClient.CreateResponseAsync(nextOptions);
            nextOptions = null;

            foreach (var item in result!.OutputItems)
            {
                allOutputItems.Add(item);
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
        var rawItems = SerializeOutputItems(allOutputItems);

        return new AgentTraceResult(
            Input: message,
            Text: text,
            Citations: citations,
            OutputItems: rawItems,
            ResponseId: result?.Id,
            DurationMs: sw.ElapsedMilliseconds);
    }

    /// <summary>
    /// Resumes a previous agent run by chaining a new user message off
    /// <paramref name="previousResponseId"/> and then auto-approving any
    /// further MCP tool calls until the model finishes. Used by the
    /// Settlement Agent's "approve in popup" flow so the human-approval
    /// decision flows back to the same agent in the same conversation and
    /// it can call the payment-release MCP tool to actually release the
    /// payment.
    /// </summary>
    public async Task<AgentTraceResult> ChatWithTraceAsync(string previousResponseId, string message)
    {
        if (string.IsNullOrWhiteSpace(previousResponseId))
            throw new ArgumentException("previousResponseId is required", nameof(previousResponseId));

        var sw = Stopwatch.StartNew();

        CreateResponseOptions? nextOptions = new()
        {
            PreviousResponseId = previousResponseId,
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };

        ResponseResult? result = null;
        var allOutputItems = new List<ResponseItem>();

        while (nextOptions is not null)
        {
            result = await _responseClient.CreateResponseAsync(nextOptions);
            nextOptions = null;

            foreach (var item in result!.OutputItems)
            {
                allOutputItems.Add(item);
                if (item is McpToolCallApprovalRequestItem mcpCall)
                {
                    _logger.LogInformation("Auto-approving MCP tool call on {ServerLabel} (resumed conversation)", mcpCall.ServerLabel);
                    nextOptions ??= new CreateResponseOptions { PreviousResponseId = result.Id };
                    nextOptions.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(mcpCall.Id, approved: true));
                }
            }
        }

        sw.Stop();
        _logger.LogInformation("Agent {AgentId} resume completed in {Duration}ms", _agentId, sw.ElapsedMilliseconds);

        var text = result?.GetOutputText() ?? string.Empty;
        var citations = ExtractCitations(result);
        var rawItems = SerializeOutputItems(allOutputItems);

        return new AgentTraceResult(
            Input: message,
            Text: text,
            Citations: citations,
            OutputItems: rawItems,
            ResponseId: result?.Id,
            DurationMs: sw.ElapsedMilliseconds);
    }

    /// <summary>
    /// Streams the agent's response and also yields a final <see cref="AgentStreamingCompleted"/>
    /// event carrying the full <see cref="AgentTraceResult"/> (text, citations, every
    /// output item, response id, and duration). This is what the "Try It Out" tab on each
    /// agent page uses so it can render text deltas live and then finalise the
    /// agent-notes panel and Engage Agent sub-tabs once the run is complete.
    /// </summary>
    public async IAsyncEnumerable<AgentStreamingEvent> RunStreamingTraceAsync(
        string message,
        [EnumeratorCancellation] CancellationToken cancellationToken = default,
        string? conversationId = null)
    {
        var sw = Stopwatch.StartNew();

        CreateResponseOptions nextOptions = new()
        {
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };
        if (!string.IsNullOrEmpty(conversationId))
            nextOptions.AgentConversationId = conversationId;

        ResponseResult? completedResponse = null;
        var allOutputItems = new List<ResponseItem>();
        var textBuilder = new StringBuilder();

        while (true)
        {
            var pendingApprovals = new List<string>();
            completedResponse = null;

            await foreach (var update in _responseClient
                .CreateResponseStreamingAsync(nextOptions, cancellationToken)
                .WithCancellation(cancellationToken))
            {
                if (update is StreamingResponseOutputTextDeltaUpdate delta)
                {
                    textBuilder.Append(delta.Delta);
                    yield return new AgentStreamingDelta(delta.Delta);
                }
                else if (update is StreamingResponseOutputItemDoneUpdate itemDone)
                {
                    allOutputItems.Add(itemDone.Item);
                    if (itemDone.Item is McpToolCallApprovalRequestItem mcpCall)
                    {
                        _logger.LogInformation("Auto-approving MCP tool call on {ServerLabel}", mcpCall.ServerLabel);
                        pendingApprovals.Add(mcpCall.Id);
                    }
                }
                else if (update is StreamingResponseCompletedUpdate done)
                {
                    completedResponse = done.Response;
                }
            }

            if (pendingApprovals.Count == 0)
                break;

            nextOptions = new CreateResponseOptions { PreviousResponseId = completedResponse!.Id };
            foreach (var id in pendingApprovals)
                nextOptions.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(id, approved: true));
        }

        sw.Stop();
        _logger.LogInformation("Agent {AgentId} streaming completed in {Duration}ms", _agentId, sw.ElapsedMilliseconds);

        var citations = ExtractCitations(completedResponse);
        var rawItems = SerializeOutputItems(allOutputItems);
        var trace = new AgentTraceResult(
            Input: message,
            Text: textBuilder.ToString(),
            Citations: citations,
            OutputItems: rawItems,
            ResponseId: completedResponse?.Id,
            DurationMs: sw.ElapsedMilliseconds);

        yield return new AgentStreamingCompleted(trace);
    }

    /// <summary>
    /// Streams a follow-up turn off <paramref name="previousResponseId"/>, mirroring
    /// <see cref="ChatWithTraceAsync(string, string)"/> but yielding incremental
    /// <see cref="AgentStreamingDelta"/> events as the model produces output and a
    /// final <see cref="AgentStreamingCompleted"/> with the full trace. Used by the
    /// "Chat with the agent" follow-up panel on the agent pages so users can ask
    /// further questions in the same conversation as the initial /process call.
    /// </summary>
    public async IAsyncEnumerable<AgentStreamingEvent> ChatStreamingTraceAsync(
        string previousResponseId,
        string message,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(previousResponseId))
            throw new ArgumentException("previousResponseId is required", nameof(previousResponseId));

        var sw = Stopwatch.StartNew();

        CreateResponseOptions nextOptions = new()
        {
            PreviousResponseId = previousResponseId,
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };

        ResponseResult? completedResponse = null;
        var allOutputItems = new List<ResponseItem>();
        var textBuilder = new StringBuilder();

        while (true)
        {
            var pendingApprovals = new List<string>();
            completedResponse = null;

            await foreach (var update in _responseClient
                .CreateResponseStreamingAsync(nextOptions, cancellationToken)
                .WithCancellation(cancellationToken))
            {
                if (update is StreamingResponseOutputTextDeltaUpdate delta)
                {
                    textBuilder.Append(delta.Delta);
                    yield return new AgentStreamingDelta(delta.Delta);
                }
                else if (update is StreamingResponseOutputItemDoneUpdate itemDone)
                {
                    allOutputItems.Add(itemDone.Item);
                    if (itemDone.Item is McpToolCallApprovalRequestItem mcpCall)
                    {
                        _logger.LogInformation("Auto-approving MCP tool call on {ServerLabel} (chat turn)", mcpCall.ServerLabel);
                        pendingApprovals.Add(mcpCall.Id);
                    }
                }
                else if (update is StreamingResponseCompletedUpdate done)
                {
                    completedResponse = done.Response;
                }
            }

            if (pendingApprovals.Count == 0)
                break;

            nextOptions = new CreateResponseOptions { PreviousResponseId = completedResponse!.Id };
            foreach (var id in pendingApprovals)
                nextOptions.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(id, approved: true));
        }

        sw.Stop();
        _logger.LogInformation("Agent {AgentId} chat streaming completed in {Duration}ms", _agentId, sw.ElapsedMilliseconds);

        var citations = ExtractCitations(completedResponse);
        var rawItems = SerializeOutputItems(allOutputItems);
        var trace = new AgentTraceResult(
            Input: message,
            Text: textBuilder.ToString(),
            Citations: citations,
            OutputItems: rawItems,
            ResponseId: completedResponse?.Id,
            DurationMs: sw.ElapsedMilliseconds);

        yield return new AgentStreamingCompleted(trace);
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

    /// <summary>
    /// Serializes each <see cref="ResponseItem"/> the agent produced into a
    /// JSON element so it can be returned over HTTP and rendered in the
    /// "Raw Output" sub-tab. Most OpenAI SDK types implement
    /// <see cref="IJsonModel{T}"/>; for anything that does not we fall back
    /// to a small projection of the type name and ToString().
    /// </summary>
    private static IReadOnlyList<JsonElement> SerializeOutputItems(IReadOnlyList<ResponseItem> items)
    {
        var list = new List<JsonElement>(items.Count);
        foreach (var item in items)
        {
            JsonElement element;
            try
            {
                var data = ModelReaderWriter.Write(item);
                using var doc = JsonDocument.Parse(data.ToMemory());
                element = doc.RootElement.Clone();
            }
            catch
            {
                var fallback = new
                {
                    type = item.GetType().Name,
                    text = item.ToString()
                };
                using var doc = JsonDocument.Parse(JsonSerializer.SerializeToUtf8Bytes(fallback));
                element = doc.RootElement.Clone();
            }
            list.Add(element);
        }
        return list;
    }
}
