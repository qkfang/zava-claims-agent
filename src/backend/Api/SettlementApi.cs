using System.Globalization;
using OpenAI.Responses;
using ZavaClaims.Agents;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record SettlementProcessRequest(
    string ClaimNumber,
    decimal? ApprovedAmount,
    decimal? PolicyLimit,
    decimal? Excess,
    decimal? Depreciation,
    decimal? PriorPayments);

record SettlementApprovalDecisionRequest(string? DecidedBy, string? Comment);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Settlement agent
/// page (<c>/agents/settlement</c>). These let the page:
///
/// 1. List the claims that have been minted by the Claims Intake demo
///    (held in the in-memory <see cref="IntakeClaimStore"/>) so the user
///    can pick one from a dropdown.
/// 2. Run the selected claim through the Foundry <c>SettlementAgent</c>
///    to produce a transparent settlement calculation, payment approval
///    request, and short settlement letter draft for human approval.
/// </summary>
public static class SettlementApi
{
    public static void MapSettlementEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // Resolve services used by both the agent invocation and the
        // payment-approval HTTP endpoints. These are always registered
        // (TeamsNotificationService degrades gracefully when no webhook
        // URL is configured).
        var paymentStore = app.Services.GetRequiredService<PaymentApprovalStore>();
        var teamsService = app.Services.GetRequiredService<TeamsNotificationService>();

        // Build the MCP ResponseTool that points the Settlement Agent at
        // the SettlementMcpTools served from /mcp on this app. We always
        // require human approval for every tool call so the operator sees
        // and authorises every payment-flow action the agent attempts.
        var mcpUrlBase = (app.Configuration["APP_MCP_URL"] ?? "http://localhost:5000").TrimEnd('/');
        ResponseTool? settlementMcpTool = null;
        try
        {
            settlementMcpTool = ResponseTool.CreateMcpTool(
                serverLabel: "settlement-mcp",
                serverUri: new Uri($"{mcpUrlBase}/mcp"),
                toolCallApprovalPolicy: new McpToolCallApprovalPolicy(GlobalMcpToolCallApprovalPolicy.AlwaysRequireApproval));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to construct settlement MCP tool descriptor; agent will run without it.");
        }
        // List the claims currently held in memory by the intake demo,
        // newest first. The shape is intentionally compact — just what
        // the dropdown on the Try It Out tab needs.
        app.MapGet("/settlement/claims", () =>
        {
            var claims = claimStore.All().Select(r => new
            {
                claimNumber = r.ClaimNumber,
                customerName = r.CustomerName,
                claimType = r.ClaimType,
                policyNumber = r.PolicyNumber,
                estimatedLoss = r.EstimatedLoss,
                createdAt = r.CreatedAt
            });
            return Results.Ok(claims);
        });

        // Read-only view of a single claim record (handy when a user
        // refreshes the page and we need to re-hydrate Step 2).
        app.MapGet("/settlement/claims/{claimNumber}", (string claimNumber) =>
        {
            var record = claimStore.Get(claimNumber);
            return record is null
                ? Results.NotFound(new { error = $"claim '{claimNumber}' not found" })
                : Results.Ok(record);
        });

        // Engage the Settlement Agent. Mirrors the Claims Intake "process"
        // endpoint: deterministic settlement maths are computed server-side
        // so the panel always has a displayable result, and when Foundry is
        // configured we also invoke the live SettlementAgent and surface
        // its narrative in `agentNotes`.
        //
        // Clients can request a live SSE stream of the agent reply by sending
        // `Accept: text/event-stream`; otherwise the response is a single JSON
        // envelope as before.
        app.MapPost("/settlement/process", async (HttpContext httpContext, SettlementProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var record = claimStore.Get(request.ClaimNumber);
            if (record is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            // Resolve settlement inputs. If the user hasn't supplied
            // overrides we fall back to sensible defaults derived from the
            // intake record so the demo still works end-to-end.
            var approved = request.ApprovedAmount ?? ParseMoney(record.EstimatedLoss) ?? 0m;
            var policyLimit = request.PolicyLimit ?? DefaultPolicyLimit(record.ClaimType, approved);
            var excess = request.Excess ?? DefaultExcess(record.ClaimType);
            var depreciation = request.Depreciation ?? 0m;
            var priorPayments = request.PriorPayments ?? 0m;

            var capped = Math.Min(approved, policyLimit);
            var payable = Math.Max(0m, capped - excess - depreciation - priorPayments);
            var humanApprovalRequired = payable >= 5000m
                || string.Equals(record.Urgency, "High", StringComparison.OrdinalIgnoreCase);
            var humanApprovalReason = payable >= 5000m
                ? $"Payable amount {FormatMoney(payable)} ≥ {FormatMoney(5000m)} authority threshold."
                : (humanApprovalRequired
                    ? "Urgency flagged High at intake — Settlement Officer must confirm release."
                    : "Within auto-approval threshold; release for Settlement Officer sign-off.");

            var calculation = new[]
            {
                new { label = "Approved amount",       amount = approved },
                new { label = "Policy limit applied",  amount = capped - approved },     // negative if capped
                new { label = "Excess applied",        amount = -excess },
                new { label = "Depreciation applied",  amount = -depreciation },
                new { label = "Prior payments",        amount = -priorPayments },
                new { label = "Payable amount",        amount = payable },
            };

            var settlementLetter =
                $"Dear {record.CustomerName},\n\n" +
                $"Thank you for your patience while we assessed claim {record.ClaimNumber} " +
                $"({record.ClaimType}) under policy {record.PolicyNumber}. " +
                $"We have completed our settlement calculation and the payable amount is " +
                $"{FormatMoney(payable)}.\n\n" +
                $"This figure is the approved amount of {FormatMoney(approved)}, " +
                $"capped at the policy limit of {FormatMoney(policyLimit)}, less the policy " +
                $"excess of {FormatMoney(excess)}" +
                (depreciation > 0 ? $", depreciation of {FormatMoney(depreciation)}" : string.Empty) +
                (priorPayments > 0 ? $", and prior payments of {FormatMoney(priorPayments)}" : string.Empty) +
                ".\n\nA Settlement Officer will release the payment to your nominated account " +
                "once this letter has been approved. If you have any questions please reply to " +
                "this email and we will be in touch.\n\n" +
                "Kind regards,\nSeth — Settlement Officer\nZava Insurance";

            // Always create a Pending payment-approval record + send the
            // Teams Adaptive Card from the API layer, so the demo flow
            // works end-to-end even when the Foundry agent (and therefore
            // the MCP-driven path) isn't configured. When the agent IS
            // configured it will also raise its own approval via the MCP
            // tool — that record lives in the same store and is surfaced
            // by /settlement/payment endpoints.
            var apiApproval = new PaymentApprovalRecord
            {
                ApprovalId = "PAY-" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant(),
                ClaimNumber = record.ClaimNumber,
                CustomerName = record.CustomerName,
                PolicyNumber = record.PolicyNumber,
                ClaimType = record.ClaimType,
                PayableAmount = payable,
                PayeeName = record.CustomerName,
                PayeeAccount = null,
                Reason = humanApprovalReason,
                Status = PaymentApprovalStatus.Pending
            };
            paymentStore.Add(apiApproval);
            var teamsResult = await teamsService.SendPaymentApprovalAsync(new PaymentApprovalRequest(
                ApprovalId: apiApproval.ApprovalId,
                ClaimNumber: apiApproval.ClaimNumber,
                CustomerName: apiApproval.CustomerName,
                PolicyNumber: apiApproval.PolicyNumber,
                ClaimType: apiApproval.ClaimType,
                PayableAmount: apiApproval.PayableAmount,
                PayeeName: apiApproval.PayeeName,
                PayeeAccount: apiApproval.PayeeAccount,
                Reason: apiApproval.Reason));
            apiApproval.TeamsChannel = teamsResult.Channel;
            apiApproval.TeamsMessage = teamsResult.Message;
            apiApproval.ApprovalUrl = teamsResult.ApprovalUrl;

            var prompt =
                "CLAIM CASE\n" +
                "==========\n" +
                $"Claim number: {record.ClaimNumber}\n" +
                $"Customer: {record.CustomerName}\n" +
                $"Policy: {record.PolicyNumber}\n" +
                $"Claim type: {record.ClaimType}\n" +
                $"Incident date: {record.IncidentDate}\n" +
                $"Incident location: {record.IncidentLocation}\n" +
                $"Description: {record.IncidentDescription}\n" +
                $"Urgency: {record.Urgency} — {record.UrgencyReason}\n\n" +
                "SETTLEMENT INPUTS\n" +
                "=================\n" +
                $"Approved amount: {FormatMoney(approved)}\n" +
                $"Policy limit: {FormatMoney(policyLimit)}\n" +
                $"Excess / deductible: {FormatMoney(excess)}\n" +
                $"Depreciation: {FormatMoney(depreciation)}\n" +
                $"Prior payments: {FormatMoney(priorPayments)}\n\n" +
                "Use the settlement_* MCP tools to cross-check the payee, " +
                "match the invoice if applicable, run the calculation, " +
                "check the authority limit, and finally call " +
                "settlement_requestPaymentApproval so a human approver " +
                "is notified in Microsoft Teams. Do NOT call " +
                "settlement_releasePayment in this run — stop after " +
                "raising the approval request and ask the human to " +
                "approve in Teams.\n\n" +
                "Then produce the standard settlement output " +
                "(calculation, cross-checks, options, payment approval " +
                "request, settlement letter draft, and human-approval " +
                "decision).";

            object BuildEnvelope(AgentTraceResult? trace, string? agentError) => new
            {
                claimNumber = record.ClaimNumber,
                customerName = record.CustomerName,
                policyNumber = record.PolicyNumber,
                claimType = record.ClaimType,
                inputs = new
                {
                    approvedAmount = approved,
                    policyLimit,
                    excess,
                    depreciation,
                    priorPayments
                },
                calculation,
                payableAmount = payable,
                payableAmountFormatted = FormatMoney(payable),
                humanApprovalRequired,
                humanApprovalReason,
                settlementLetter,
                agentNotes = trace?.Text,
                agentConfigured = agentFactory.IsConfigured,
                agentError,
                agentInput = trace?.Input,
                agentRawOutput = trace is null ? null : new
                {
                    text = trace.Text,
                    citations = trace.Citations,
                    outputItems = trace.OutputItems,
                    responseId = trace.ResponseId,
                    durationMs = trace.DurationMs
                },
                paymentApproval = new
                {
                    approvalId = apiApproval.ApprovalId,
                    status = apiApproval.Status.ToString().ToLowerInvariant(),
                    teamsSent = teamsResult.Sent,
                    teamsChannel = teamsResult.Channel,
                    teamsConfigured = teamsService.IsConfigured,
                    approvalUrl = teamsResult.ApprovalUrl,
                    teamsMessage = teamsResult.Message
                },
                mcpConfigured = settlementMcpTool != null
            };

            logger.LogInformation("Settlement process: claim={ClaimNumber} payable={Payable} approvalId={ApprovalId}",
                Sanitize(record.ClaimNumber), payable, Sanitize(apiApproval.ApprovalId));

            // Build the optional MCP extra-tools list for the SettlementAgent.
            List<ResponseTool>? BuildExtraTools() => settlementMcpTool != null
                ? new List<ResponseTool> { settlementMcpTool }
                : null;

            if (AgentSseStreaming.WantsEventStream(httpContext))
            {
                var streamingAgent = agentFactory.IsConfigured
                    ? agentFactory.Create("settlement", BuildExtraTools())
                    : null;
                await AgentSseStreaming.StreamAsync(httpContext, streamingAgent, prompt, BuildEnvelope, logger, "Settlement Agent");
                return Results.Empty;
            }

            AgentTraceResult? traceResult = null;
            string? agentInvocationError = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var agent = agentFactory.Create("settlement", BuildExtraTools());
                    traceResult = await agent.RunWithTraceAsync(prompt);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Settlement Agent invocation failed; falling back to deterministic demo calculation");
                    agentInvocationError = ex.Message;
                }
            }

            return Results.Ok(BuildEnvelope(traceResult, agentInvocationError));
        });

        // ── Payment-approval endpoints ──────────────────────────────────
        // Used by both the Settlement page UI and (where supported) the
        // Approve/Reject buttons inside the Microsoft Teams Adaptive Card.

        app.MapGet("/settlement/payment/{approvalId}", (string approvalId) =>
        {
            var record = paymentStore.Get(approvalId);
            return record is null
                ? Results.NotFound(new { error = $"approval '{approvalId}' not found" })
                : Results.Ok(SerializeApproval(record));
        });

        app.MapGet("/settlement/payments", () =>
        {
            return Results.Ok(paymentStore.All().Select(SerializeApproval));
        });

        app.MapPost("/settlement/payment/{approvalId}/approve",
            (string approvalId, SettlementApprovalDecisionRequest? body) =>
        {
            var record = paymentStore.Get(approvalId);
            if (record is null)
                return Results.NotFound(new { error = $"approval '{approvalId}' not found" });
            if (record.Status == PaymentApprovalStatus.Released)
                return Results.Conflict(new { error = "payment already released" });
            if (record.Status == PaymentApprovalStatus.Rejected)
                return Results.Conflict(new { error = "payment already rejected" });

            record.Status = PaymentApprovalStatus.Approved;
            record.Decision = "approved";
            record.DecidedBy = string.IsNullOrWhiteSpace(body?.DecidedBy) ? "Teams approver" : body!.DecidedBy;
            record.DecidedAt = DateTimeOffset.UtcNow;
            logger.LogInformation("Settlement approval granted: {ApprovalId} by {By}",
                Sanitize(record.ApprovalId), Sanitize(record.DecidedBy ?? string.Empty));
            return Results.Ok(SerializeApproval(record));
        });

        app.MapPost("/settlement/payment/{approvalId}/reject",
            (string approvalId, SettlementApprovalDecisionRequest? body) =>
        {
            var record = paymentStore.Get(approvalId);
            if (record is null)
                return Results.NotFound(new { error = $"approval '{approvalId}' not found" });
            if (record.Status == PaymentApprovalStatus.Released)
                return Results.Conflict(new { error = "payment already released" });

            record.Status = PaymentApprovalStatus.Rejected;
            record.Decision = "rejected";
            record.DecidedBy = string.IsNullOrWhiteSpace(body?.DecidedBy) ? "Teams approver" : body!.DecidedBy;
            record.DecidedAt = DateTimeOffset.UtcNow;
            logger.LogInformation("Settlement approval rejected: {ApprovalId} by {By}",
                Sanitize(record.ApprovalId), Sanitize(record.DecidedBy ?? string.Empty));
            return Results.Ok(SerializeApproval(record));
        });

        app.MapPost("/settlement/payment/{approvalId}/release", (string approvalId) =>
        {
            var record = paymentStore.Get(approvalId);
            if (record is null)
                return Results.NotFound(new { error = $"approval '{approvalId}' not found" });
            if (record.Status != PaymentApprovalStatus.Approved)
                return Results.Conflict(new { error = $"approval is in status '{record.Status}'; must be Approved before release" });

            record.Status = PaymentApprovalStatus.Released;
            record.PaymentReference = "PMT-" + DateTimeOffset.UtcNow.ToString("yyyyMMdd") + "-" + record.ApprovalId[^6..];
            record.ReleasedAt = DateTimeOffset.UtcNow;
            logger.LogInformation("Settlement payment released: {ApprovalId} ref={Ref}",
                Sanitize(record.ApprovalId), Sanitize(record.PaymentReference));
            return Results.Ok(SerializeApproval(record));
        });
    }

    private static object SerializeApproval(PaymentApprovalRecord r) => new
    {
        approvalId = r.ApprovalId,
        claimNumber = r.ClaimNumber,
        customerName = r.CustomerName,
        policyNumber = r.PolicyNumber,
        claimType = r.ClaimType,
        payableAmount = r.PayableAmount,
        payableAmountFormatted = r.PayableAmount.ToString("C0", CultureInfo.GetCultureInfo("en-AU")),
        payeeName = r.PayeeName,
        payeeAccount = r.PayeeAccount,
        reason = r.Reason,
        status = r.Status.ToString().ToLowerInvariant(),
        decision = r.Decision,
        decidedBy = r.DecidedBy,
        decidedAt = r.DecidedAt,
        paymentReference = r.PaymentReference,
        releasedAt = r.ReleasedAt,
        teamsChannel = r.TeamsChannel,
        teamsMessage = r.TeamsMessage,
        approvalUrl = r.ApprovalUrl,
        createdAt = r.CreatedAt
    };

    private static decimal? ParseMoney(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var cleaned = new string(value.Where(c => char.IsDigit(c) || c == '.' || c == '-').ToArray());
        if (string.IsNullOrEmpty(cleaned)) return null;
        return decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    private static string FormatMoney(decimal amount) =>
        amount.ToString("C0", CultureInfo.GetCultureInfo("en-AU"));

    private static decimal DefaultPolicyLimit(string claimType, decimal approved)
    {
        var t = (claimType ?? string.Empty).ToLowerInvariant();
        if (t.Contains("home")) return 750_000m;
        if (t.Contains("motor") || t.Contains("car")) return 60_000m;
        if (t.Contains("travel")) return 15_000m;
        if (t.Contains("business")) return 250_000m;
        if (t.Contains("life")) return 500_000m;
        // Fallback: be generous so the default limit doesn't itself cap the payout.
        return Math.Max(approved * 5m, 50_000m);
    }

    private static decimal DefaultExcess(string claimType)
    {
        var t = (claimType ?? string.Empty).ToLowerInvariant();
        if (t.Contains("home")) return 500m;
        if (t.Contains("motor") || t.Contains("car")) return 800m;
        if (t.Contains("travel")) return 250m;
        if (t.Contains("business")) return 1_000m;
        return 500m;
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}
