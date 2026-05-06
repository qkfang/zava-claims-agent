using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record CommunicationsProcessRequest(string ClaimNumber);

record CommunicationsVoiceRequest(string Message, string? ClaimNumber, string? ConversationId);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Customer
/// Communications agent page (<c>/agents/customer-communications</c>).
///
/// The flow mirrors the Claims Intake demo:
///
/// 1. List the claims minted by the Claims Intake demo (held in
///    <see cref="IntakeClaimStore"/>) so the user can pick one from a
///    dropdown.
/// 2. Run the selected claim through the Customer Communications Agent
///    (Cara) which drafts empathetic plain-English updates across
///    email / SMS / portal, summarises current status &amp; next steps,
///    and surfaces vulnerability flags for human review.
/// </summary>
public static class CommunicationsApi
{
    public static void MapCommunicationsEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // Lightweight list used to populate the Claim ID dropdown on the
        // Try It Out tab. Returns claims most-recent first.
        app.MapGet("/communications/claims", () =>
        {
            var claims = claimStore.All().Select(c => new
            {
                claimNumber = c.ClaimNumber,
                customerName = c.CustomerName,
                claimType = c.ClaimType,
                urgency = c.Urgency,
                policyNumber = c.PolicyNumber,
                createdAt = c.CreatedAt
            });
            return Results.Ok(claims);
        });

        // Full record for a single claim — mirrors /intake/claims/{n}.
        app.MapGet("/communications/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });

        // Engage the Customer Communications Agent on the selected claim.
        // Deterministic drafts are generated server-side so the demo always
        // produces output; when Foundry is configured the live agent is
        // also invoked and its narrative is surfaced in `agentNotes`.
        app.MapPost("/communications/process", async (CommunicationsProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var record = claimStore.Get(request.ClaimNumber);
            if (record is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Communications process: claimNumber={ClaimNumber}",
                Sanitize(record.ClaimNumber));

            var drafts = CustomerCommunicationsDrafter.Draft(record);

            string? agentNotes = null;
            string? agentInput = null;
            object? agentRawOutput = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var prompt =
                        "CLAIM CASE FOR CUSTOMER COMMUNICATIONS\n" +
                        "======================================\n" +
                        $"Claim number   : {record.ClaimNumber}\n" +
                        $"Customer       : {record.CustomerName}\n" +
                        $"Email          : {record.CustomerEmail}\n" +
                        $"Phone          : {record.CustomerPhone}\n" +
                        $"Preferred      : {record.PreferredContact}\n" +
                        $"Policy         : {record.PolicyNumber}\n" +
                        $"Claim type     : {record.ClaimType}\n" +
                        $"Incident date  : {record.IncidentDate}\n" +
                        $"Incident place : {record.IncidentLocation}\n" +
                        $"Description    : {record.IncidentDescription}\n" +
                        $"Estimated loss : {record.EstimatedLoss}\n" +
                        $"Urgency        : {record.Urgency} — {record.UrgencyReason}\n" +
                        $"Stage          : Lodged, awaiting Claims Assessment\n\n" +
                        "Please draft empathetic, plain-English customer updates for this claim across " +
                        "the most appropriate channels (email, SMS, portal). Include a short summary of " +
                        "current status and next steps, and surface any vulnerability flags that need a " +
                        "human reviewer before sending.";

                    var agent = agentFactory.Create("communications");
                    var result = await agent.RunWithTraceAsync(prompt);
                    agentNotes = result.Text;
                    agentInput = result.Input;
                    agentRawOutput = new
                    {
                        text = result.Text,
                        citations = result.Citations,
                        outputItems = result.OutputItems,
                        responseId = result.ResponseId,
                        durationMs = result.DurationMs
                    };
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Customer Communications Agent invocation failed; falling back to deterministic drafts");
                }
            }

            return Results.Ok(new
            {
                claimNumber = record.ClaimNumber,
                customerName = record.CustomerName,
                claimType = record.ClaimType,
                urgency = record.Urgency,
                stage = "Lodged — awaiting Claims Assessment",
                drafts.Email,
                drafts.Sms,
                drafts.Portal,
                drafts.Summary,
                drafts.NextSteps,
                drafts.VulnerabilityFlags,
                drafts.HumanApprovalRequired,
                drafts.HumanApprovalReason,
                agentNotes,
                agentConfigured = agentFactory.IsConfigured,
                agentInput,
                agentRawOutput
            });
        });

        // Voice chat endpoint — backs the "Voice chat" tab on the
        // Customer Communications agent page. Accepts a transcribed user
        // message (the browser does the speech-to-text) along with an
        // optional claim context and conversation id, and returns a short
        // plain-English reply that the browser then speaks aloud via the
        // Web Speech API. When the Foundry agent is configured the live
        // Customer Communications Agent generates the reply; otherwise a
        // deterministic, empathetic fallback is returned so the demo
        // always works end-to-end.
        app.MapPost("/communications/voice", async (CommunicationsVoiceRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.Message))
                return Results.BadRequest(new { error = "message is required" });

            // Pull optional claim context to ground the reply.
            IntakeClaimRecord? record = null;
            if (!string.IsNullOrWhiteSpace(request.ClaimNumber))
                record = claimStore.Get(request.ClaimNumber);

            logger.LogInformation(
                "Communications voice: claimNumber={ClaimNumber}, conversationId={ConversationId}",
                Sanitize(request.ClaimNumber ?? "(none)"),
                Sanitize(request.ConversationId ?? "(new)"));

            string reply;
            string? conversationId = request.ConversationId;
            bool agentUsed = false;

            if (agentFactory.IsConfigured)
            {
                try
                {
                    var prompt =
                        "You are Cara, the Customer Communications Specialist at Zava Insurance. " +
                        "You are speaking with the customer over a voice call, so reply in short, " +
                        "warm, plain-English sentences (no markdown, no bullet points, no headings). " +
                        "Keep replies to 2-4 sentences. Never invent claim facts; if you don't know, " +
                        "say you'll check and follow up. If the situation sounds sensitive, be empathetic " +
                        "and offer to escalate to a human teammate.\n\n";

                    if (record is not null)
                    {
                        prompt +=
                            "CURRENT CLAIM CONTEXT\n" +
                            $"Claim number   : {record.ClaimNumber}\n" +
                            $"Customer       : {record.CustomerName}\n" +
                            $"Policy         : {record.PolicyNumber}\n" +
                            $"Claim type     : {record.ClaimType}\n" +
                            $"Incident       : {record.IncidentDate} · {record.IncidentLocation}\n" +
                            $"Description    : {record.IncidentDescription}\n" +
                            $"Urgency        : {record.Urgency}\n" +
                            $"Stage          : Lodged, awaiting Claims Assessment\n\n";
                    }

                    prompt += "CUSTOMER SAID (over voice):\n" + request.Message;

                    var agent = agentFactory.Create("communications");
                    var result = await agent.RunWithTraceAsync(prompt, conversationId);
                    reply = StripMarkdown(result.Text);
                    // NOTE: each turn currently runs stateless; we keep
                    // whatever conversationId the caller supplied so the
                    // browser can still group messages on its side.
                    agentUsed = true;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Customer Communications voice agent invocation failed; using fallback reply");
                    reply = FallbackVoiceReply(request.Message, record);
                }
            }
            else
            {
                reply = FallbackVoiceReply(request.Message, record);
            }

            return Results.Ok(new
            {
                reply,
                conversationId,
                agentConfigured = agentFactory.IsConfigured,
                agentUsed
            });
        });
    }

    // Strip very basic markdown so the reply sounds natural when read aloud
    // by the browser's speech synthesiser. Removes leading list markers,
    // headings, emphasis characters and code fences.
    private static string StripMarkdown(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var lines = text.Replace("\r\n", "\n").Split('\n');
        var cleaned = new List<string>(lines.Length);
        foreach (var raw in lines)
        {
            var line = raw.TrimStart();
            if (line.StartsWith("```")) continue;
            // Strip heading markers (# foo) and list markers (- foo, * foo, 1. foo)
            while (line.StartsWith("#")) line = line[1..];
            if (line.StartsWith("- ") || line.StartsWith("* ")) line = line[2..];
            line = System.Text.RegularExpressions.Regex.Replace(line, @"^\d+\.\s+", "");
            // Drop emphasis chars
            line = line.Replace("**", "").Replace("__", "").Replace("`", "");
            cleaned.Add(line.Trim());
        }
        return string.Join(" ", cleaned.Where(l => l.Length > 0)).Trim();
    }

    private static string FallbackVoiceReply(string message, IntakeClaimRecord? record)
    {
        var who = record?.CustomerName?.Split(' ').FirstOrDefault();
        var greet = string.IsNullOrEmpty(who) ? "Hi there" : $"Hi {who}";
        if (record is null)
        {
            return $"{greet}, this is Cara from Zava Insurance Customer Communications. " +
                   "I heard you, and I'd be glad to help. Could you share the claim number you're calling about so I can pull up the details?";
        }

        var stage = "lodged and awaiting our Claims Assessment team";
        return $"{greet}, this is Cara from Zava Insurance. " +
               $"Your claim {record.ClaimNumber} for the {record.ClaimType.ToLowerInvariant()} incident is {stage}. " +
               "I've noted what you just told me, and I'll make sure the team has it before they reach out next. Is there anything else I can help with right now?";
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}
