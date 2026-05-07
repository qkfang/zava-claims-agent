using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Microsoft.Extensions.AI;
using ZavaClaims.Agents;
using ZavaClaims.App.Models;

namespace ZavaClaims.App.Services;

/// <summary>
/// One participant in the Team Leader group chat.
/// </summary>
public record GroupChatParticipant(string Id, string Persona, string Role, string AgentRole);

/// <summary>
/// One streamed turn event written to the group-chat session channel and
/// surfaced over HTTP. <c>Kind</c> is one of: <c>info</c> (orchestration
/// status), <c>ask</c> (Team Leader's question to a specialist),
/// <c>reply</c> (specialist's response), <c>conclude</c> (Team Leader's
/// final summary), <c>error</c>, <c>done</c>.
/// </summary>
public record GroupChatTurn(
    string Kind,
    string SpeakerId,
    string SpeakerPersona,
    string SpeakerRole,
    string Text,
    DateTimeOffset Timestamp);

/// <summary>
/// Cumulative state of a single group-chat session; persisted in memory so
/// late HTTP subscribers can see the full transcript so far.
/// </summary>
public class GroupChatSession
{
    public string Id { get; }
    public string ClaimNumber { get; }
    public List<GroupChatTurn> Turns { get; } = new();
    public Channel<GroupChatTurn> Events { get; } =
        Channel.CreateUnbounded<GroupChatTurn>(new UnboundedChannelOptions
        {
            // Exactly one orchestration task writes to this channel and the
            // matching SSE handler is the only reader for the session.
            SingleReader = true,
            SingleWriter = true
        });
    public bool Completed { get; set; }

    public GroupChatSession(string id, string claimNumber)
    {
        Id = id;
        ClaimNumber = claimNumber;
    }
}

/// <summary>
/// Orchestrates a multi-agent group chat about a single claim.
///
/// Modelled on the <c>GroupChatManager</c> / <c>GroupChatHost</c> pattern in
/// <c>Microsoft.Agents.AI.Workflows</c> (see
/// <c>AgentWorkflowBuilder.CreateGroupChatBuilderWith</c>): the Team Leader
/// Agent acts as the group-chat manager (<c>SelectNextAgentAsync</c> +
/// <c>ShouldTerminateAsync</c>), and the seven other claims-office agents
/// (Intake, Assessment, Loss Adjuster, Fraud, Supplier, Settlement,
/// Communications) participate as specialists.
///
/// We keep the transcript as <see cref="ChatMessage"/> instances — the same
/// type the framework's <c>GroupChatManager</c> consumes — so the orchestration
/// could later be lifted onto the framework's workflow runtime once the
/// existing Foundry agents are wrapped as <c>AIAgent</c> instances.
/// </summary>
public class TeamLeaderGroupChatService
{
    // Hard cap on the number of group-chat turns. Each iteration of the
    // orchestration loop is framed to the Team Leader (the group-chat
    // manager) as one "turn" — at each turn Theo either picks a specialist
    // to speak or concludes the discussion. The cap guarantees the chat
    // ends even if Theo never elects to conclude on his own.
    private const int MaxIterations = 20;

    private readonly IntakeClaimStore _claimStore;
    private readonly ClaimsAgentFactory _agentFactory;
    private readonly ILogger<TeamLeaderGroupChatService> _logger;

    private readonly ConcurrentDictionary<string, GroupChatSession> _sessions =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Specialist participants in the group chat (every staff role except
    /// the Team Leader, who acts as the manager).
    /// </summary>
    public static readonly IReadOnlyList<GroupChatParticipant> Participants = new[]
    {
        new GroupChatParticipant("claims-intake",          "Iris",   "Claims Intake Officer",            "intake"),
        new GroupChatParticipant("claims-assessment",      "Adam",   "Claims Assessor",                  "assessment"),
        new GroupChatParticipant("loss-adjuster",          "Liam",   "Loss Adjuster",                    "loss-adjuster"),
        new GroupChatParticipant("fraud-investigation",    "Fern",   "Fraud Investigator",               "fraud"),
        new GroupChatParticipant("supplier-coordinator",   "Sven",   "Supplier Coordinator",             "supplier"),
        new GroupChatParticipant("settlement",             "Sara",   "Settlement Officer",               "settlement"),
        new GroupChatParticipant("customer-communications","Cleo",   "Customer Communications Specialist","communications"),
    };

    public TeamLeaderGroupChatService(
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger<TeamLeaderGroupChatService> logger)
    {
        _claimStore = claimStore;
        _agentFactory = agentFactory;
        _logger = logger;
    }

    public bool IsConfigured => _agentFactory.IsConfigured;

    public IntakeClaimRecord? GetClaim(string claimNumber) => _claimStore.Get(claimNumber);

    public GroupChatSession? GetSession(string sessionId) =>
        _sessions.TryGetValue(sessionId, out var s) ? s : null;

    /// <summary>
    /// Start a group-chat session for the given claim. Returns immediately
    /// with the new session; orchestration runs on a background task and
    /// pushes <see cref="GroupChatTurn"/> events to the session channel.
    /// </summary>
    public GroupChatSession StartSession(IntakeClaimRecord claim)
    {
        var session = new GroupChatSession(Guid.NewGuid().ToString("N"), claim.ClaimNumber);
        _sessions[session.Id] = session;
        _ = Task.Run(() => RunOrchestrationAsync(session, claim));
        return session;
    }

    private async Task RunOrchestrationAsync(GroupChatSession session, IntakeClaimRecord claim)
    {
        try
        {
            await EmitAsync(session, "info", "team-leader", "Theo", "Claims Team Leader",
                $"Opening group chat for claim {claim.ClaimNumber}. Inviting the team…");

            // Conversation history kept in MAF's ChatMessage shape. Each
            // ChatMessage's AuthorName carries the speaker persona so the
            // Team Leader manager can refer back to who said what.
            var history = new List<ChatMessage>
            {
                new(ChatRole.System, BuildBrief(claim)) { AuthorName = "BriefingPack" }
            };

            var leader = _agentFactory.Create("team-leader");
            var specialistsById = Participants.ToDictionary(p => p.Id, p => p, StringComparer.OrdinalIgnoreCase);

            for (var iteration = 0; iteration < MaxIterations; iteration++)
            {
                // Manager step: ask the Team Leader who should speak next, or conclude.
                var managerPrompt = BuildManagerPrompt(claim, history, iteration, MaxIterations);
                var managerResult = await leader.RunWithTraceAsync(managerPrompt);
                var decision = ParseManagerDecision(managerResult.Text);

                if (decision is null)
                {
                    _logger.LogWarning("Team Leader returned an unparseable decision; concluding. Raw: {Raw}",
                        Truncate(managerResult.Text, 400));
                    await EmitAsync(session, "conclude", "team-leader", "Theo", "Claims Team Leader",
                        managerResult.Text.Trim());
                    history.Add(new ChatMessage(ChatRole.Assistant, managerResult.Text) { AuthorName = "Theo" });
                    break;
                }

                if (string.Equals(decision.Action, "conclude", StringComparison.OrdinalIgnoreCase))
                {
                    var summary = string.IsNullOrWhiteSpace(decision.Summary)
                        ? "The team has reached a conclusion. Closing the discussion."
                        : decision.Summary!;
                    await EmitAsync(session, "conclude", "team-leader", "Theo", "Claims Team Leader", summary);
                    history.Add(new ChatMessage(ChatRole.Assistant, summary) { AuthorName = "Theo" });
                    break;
                }

                if (!specialistsById.TryGetValue(decision.Speaker ?? "", out var participant))
                {
                    var note = $"(Team Leader picked unknown speaker '{decision.Speaker}'. Closing discussion.)";
                    await EmitAsync(session, "conclude", "team-leader", "Theo", "Claims Team Leader", note);
                    break;
                }

                var question = string.IsNullOrWhiteSpace(decision.Prompt)
                    ? $"{participant.Persona}, please share your view on this claim."
                    : decision.Prompt!;

                await EmitAsync(session, "ask", "team-leader", "Theo", "Claims Team Leader",
                    $"@{participant.Persona} ({participant.Role}) — {question}");
                history.Add(new ChatMessage(ChatRole.Assistant, $"To {participant.Persona}: {question}")
                {
                    AuthorName = "Theo"
                });

                // Specialist step.
                ClaimsAgent specialist;
                try
                {
                    specialist = _agentFactory.Create(participant.AgentRole);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to create specialist {Role}", participant.AgentRole);
                    await EmitAsync(session, "error", participant.Id, participant.Persona, participant.Role,
                        $"Failed to engage {participant.Persona}: {ex.Message}");
                    continue;
                }

                var specialistPrompt = BuildSpecialistPrompt(claim, participant, question, history);
                AgentTraceResult specialistResult;
                try
                {
                    specialistResult = await specialist.RunWithTraceAsync(specialistPrompt);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Specialist {Role} failed", participant.AgentRole);
                    await EmitAsync(session, "error", participant.Id, participant.Persona, participant.Role,
                        $"{participant.Persona} could not respond: {ex.Message}");
                    continue;
                }

                var reply = string.IsNullOrWhiteSpace(specialistResult.Text)
                    ? "(no response)"
                    : specialistResult.Text.Trim();
                await EmitAsync(session, "reply", participant.Id, participant.Persona, participant.Role, reply);
                history.Add(new ChatMessage(ChatRole.Assistant, reply) { AuthorName = participant.Persona });
            }

            if (!session.Turns.Any(t => t.Kind == "conclude"))
            {
                await EmitAsync(session, "conclude", "team-leader", "Theo", "Claims Team Leader",
                    $"Reached the {MaxIterations}-turn limit. Closing the discussion and recording the transcript.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Group-chat orchestration failed for claim {ClaimNumber}", claim.ClaimNumber);
            await EmitAsync(session, "error", "team-leader", "Theo", "Claims Team Leader",
                "Orchestration failed: " + ex.Message);
        }
        finally
        {
            session.Completed = true;
            await session.Events.Writer.WriteAsync(new GroupChatTurn(
                "done", "system", "system", "system", "", DateTimeOffset.UtcNow));
            session.Events.Writer.TryComplete();
        }
    }

    private static async Task EmitAsync(
        GroupChatSession session, string kind, string speakerId,
        string persona, string role, string text)
    {
        var turn = new GroupChatTurn(kind, speakerId, persona, role, text, DateTimeOffset.UtcNow);
        session.Turns.Add(turn);
        await session.Events.Writer.WriteAsync(turn);
    }

    private static string BuildBrief(IntakeClaimRecord claim) =>
        "CLAIM CASE FOR GROUP-CHAT REVIEW\n" +
        "================================\n" +
        $"Claim number    : {claim.ClaimNumber}\n" +
        $"Customer        : {claim.CustomerName}\n" +
        $"Customer email  : {claim.CustomerEmail}\n" +
        $"Customer phone  : {claim.CustomerPhone}\n" +
        $"Policy number   : {claim.PolicyNumber}\n" +
        $"Claim type      : {claim.ClaimType}\n" +
        $"Incident date   : {claim.IncidentDate}\n" +
        $"Incident location: {claim.IncidentLocation}\n" +
        $"Estimated loss  : {claim.EstimatedLoss}\n" +
        $"Urgency         : {claim.Urgency} ({claim.UrgencyReason})\n" +
        $"Lodged at       : {claim.CreatedAt:u}\n\n" +
        "INCIDENT DESCRIPTION\n" +
        "--------------------\n" +
        claim.IncidentDescription;

    private static string BuildManagerPrompt(
        IntakeClaimRecord claim, IReadOnlyList<ChatMessage> history, int iteration, int maxIterations)
    {
        var roster = string.Join("\n", Participants.Select(p =>
            $"- {p.Id}: {p.Persona}, {p.Role}"));
        var transcript = RenderTranscript(history);

        return
            "You are Theo, the Claims Team Leader, chairing a group-chat with the\n" +
            "claims-office specialists about ONE claim. You are the GROUP-CHAT MANAGER:\n" +
            "you decide which specialist speaks next, or whether the team has reached\n" +
            "a conclusion and the discussion should end.\n\n" +
            $"This is turn {iteration + 1} of at most {maxIterations}.\n\n" +
            "PARTICIPANTS (use the id in the JSON 'speaker' field):\n" +
            roster + "\n\n" +
            "CLAIM:\n" +
            BuildBrief(claim) + "\n\n" +
            "TRANSCRIPT SO FAR:\n" +
            (string.IsNullOrWhiteSpace(transcript) ? "(empty)" : transcript) + "\n\n" +
            "DECIDE the next step. Options:\n" +
            "  1. Pick the most relevant specialist who has NOT yet covered their\n" +
            "     part of the claim, and ask them ONE focused question.\n" +
            "  2. Conclude the discussion if the team has covered intake completeness,\n" +
            "     coverage, on-site / damage view, fraud signals, supplier needs,\n" +
            "     settlement direction and customer messaging — or earlier if the\n" +
            "     claim is straightforward.\n\n" +
            "Respond with ONLY a JSON object (no prose, no markdown fences) in this\n" +
            "exact shape:\n" +
            "{\n" +
            "  \"action\":  \"ask\" | \"conclude\",\n" +
            "  \"speaker\": \"<participant id>\"        // required when action=ask\n" +
            "  \"prompt\":  \"<question to specialist>\" // required when action=ask\n" +
            "  \"summary\": \"<final team-leader summary>\" // required when action=conclude\n" +
            "}\n";
    }

    private static string BuildSpecialistPrompt(
        IntakeClaimRecord claim, GroupChatParticipant participant, string question,
        IReadOnlyList<ChatMessage> history)
    {
        var transcript = RenderTranscript(history);
        return
            $"You are participating in a Zava Insurance claims-office GROUP CHAT about\n" +
            $"claim {claim.ClaimNumber}, chaired by Theo (Team Leader).\n\n" +
            "Stay in character as your role and answer Theo's question directly and\n" +
            "concisely (under 200 words). Do NOT repeat your full standard report —\n" +
            "speak conversationally, as if in a stand-up with the team. End with a\n" +
            "single line beginning 'Recommendation:' summarising your input.\n\n" +
            "CLAIM:\n" + BuildBrief(claim) + "\n\n" +
            "TRANSCRIPT SO FAR:\n" +
            (string.IsNullOrWhiteSpace(transcript) ? "(empty)" : transcript) + "\n\n" +
            $"THEO ASKS YOU ({participant.Persona}, {participant.Role}):\n" + question;
    }

    private static string RenderTranscript(IReadOnlyList<ChatMessage> history)
    {
        var lines = new List<string>();
        foreach (var msg in history)
        {
            if (msg.Role == ChatRole.System) continue;
            var who = string.IsNullOrWhiteSpace(msg.AuthorName) ? msg.Role.Value : msg.AuthorName;
            lines.Add($"{who}: {msg.Text}");
        }
        return string.Join("\n\n", lines);
    }

    private static ManagerDecision? ParseManagerDecision(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;

        // Strip markdown code fences if the model added them despite instructions.
        var cleaned = Regex.Replace(text, "```(?:json)?", "", RegexOptions.IgnoreCase).Trim();
        var braceStart = cleaned.IndexOf('{');
        var braceEnd = cleaned.LastIndexOf('}');
        if (braceStart < 0 || braceEnd <= braceStart) return null;

        var json = cleaned.Substring(braceStart, braceEnd - braceStart + 1);
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            return new ManagerDecision(
                Action: root.TryGetProperty("action", out var a) ? a.GetString() : null,
                Speaker: root.TryGetProperty("speaker", out var s) ? s.GetString() : null,
                Prompt: root.TryGetProperty("prompt", out var p) ? p.GetString() : null,
                Summary: root.TryGetProperty("summary", out var sm) ? sm.GetString() : null);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? string.Empty : (s.Length <= max ? s : s[..max] + "…");

    private record ManagerDecision(string? Action, string? Speaker, string? Prompt, string? Summary);
}
