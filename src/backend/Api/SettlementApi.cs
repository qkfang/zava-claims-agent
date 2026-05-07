using System.Globalization;
using System.Text.Json;
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
        //
        // APP_MCP_URL must be a publicly reachable URL (devtunnel/ngrok)
        // because the Foundry Responses API enumerates MCP tools from the
        // cloud — it cannot reach http://localhost on the developer's
        // machine. When unset, the Settlement Agent runs without the MCP
        // tool surface rather than failing on an unreachable URL.
        var configuredMcpUrl = app.Configuration["APP_MCP_URL"];
        ResponseTool? settlementMcpTool = null;
        if (!string.IsNullOrWhiteSpace(configuredMcpUrl))
        {
            var mcpUrlBase = configuredMcpUrl.TrimEnd('/');
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
        }
        else
        {
            logger.LogWarning("APP_MCP_URL is not configured; Settlement Agent will run without the settlement-mcp tool surface. Set APP_MCP_URL to a publicly reachable tunnel URL (devtunnel/ngrok) to enable it.");
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

            // When the settlement-mcp tool surface isn't reachable from
            // Foundry (APP_MCP_URL not set), build a "mock MCP tool
            // results" block that pre-executes the same settlement_*
            // tools server-side and hands the agent their outputs as
            // authoritative — so the agent can complete the cross-check
            // and payment-approval workflow without claiming the tools
            // are unavailable.
            var mockToolResultsBlock = settlementMcpTool == null
                ? BuildMockSettlementToolResults(
                    record,
                    approved,
                    policyLimit,
                    excess,
                    depreciation,
                    priorPayments,
                    payable,
                    apiApproval,
                    teamsResult,
                    teamsService.IsConfigured)
                : null;

            var toolUsageInstruction = mockToolResultsBlock == null
                ? "Use the settlement_* MCP tools to cross-check the payee, " +
                  "match the invoice if applicable, run the calculation, " +
                  "check the authority limit, and finally call " +
                  "settlement_requestPaymentApproval so a human approver " +
                  "is notified in Microsoft Teams. Do NOT call " +
                  "settlement_releasePayment in this run — stop after " +
                  "raising the approval request and ask the human to " +
                  "approve in Teams."
                : "The settlement_* MCP tools have ALREADY BEEN INVOKED " +
                  "for this run and their results are provided in the " +
                  "MOCK MCP TOOL RESULTS section below. Treat those JSON " +
                  "payloads as authoritative tool outputs from " +
                  "settlement_validatePayee, settlement_matchInvoice, " +
                  "settlement_calculateSettlement, " +
                  "settlement_checkAuthorityLimit and " +
                  "settlement_requestPaymentApproval. Do NOT say the " +
                  "tools are unavailable, do NOT ask the user to enable " +
                  "them, and do NOT attempt to re-call them. Use these " +
                  "values directly to produce the settlement output. The " +
                  "human-approval request has been posted to Microsoft " +
                  "Teams via settlement_requestPaymentApproval; stop " +
                  "after surfacing the approvalId and asking the human " +
                  "to approve — do NOT release the payment in this run.";

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
                (mockToolResultsBlock ?? string.Empty) +
                toolUsageInstruction +
                "\n\n" +
                "Then produce the standard settlement output " +
                "(calculation, cross-checks, options, payment approval " +
                "request, settlement letter draft, and human-approval " +
                "decision).";

            object BuildEnvelope(AgentTraceResult? trace, string? agentError) {
                // Capture the agent's response id so the popup-driven
                // /settlement/payment/{id}/agent-approve endpoint can
                // resume the same conversation and let the agent call
                // settlement_releasePayment after the human approves.
                if (trace?.ResponseId is { Length: > 0 } responseId)
                    apiApproval.PreviousResponseId = responseId;

                return new
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
                        teamsMessage = teamsResult.Message,
                        // Surface previousResponseId so the page knows the
                        // popup approval can chain back into the agent.
                        previousResponseId = apiApproval.PreviousResponseId,
                        agentResumeAvailable = apiApproval.PreviousResponseId is { Length: > 0 } && agentFactory.IsConfigured,
                        payableAmount = apiApproval.PayableAmount,
                        payableAmountFormatted = FormatMoney(apiApproval.PayableAmount),
                        payeeName = apiApproval.PayeeName,
                        reason = apiApproval.Reason
                    },
                    mcpConfigured = settlementMcpTool != null
                };
            }

            logger.LogInformation("Settlement process: claim={ClaimNumber} payable={Payable} approvalId={ApprovalId}",
                Sanitize(record.ClaimNumber), payable, Sanitize(apiApproval.ApprovalId));

            // Build the optional MCP extra-tools list for the SettlementAgent.
            // When non-null this wires settlement_* tools onto the Foundry agent
            // so it can drive payee/invoice/authority cross-checks itself.
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

        // Popup-driven approval: the operator clicks Approve in the
        // Settlement page modal, the approval record flips to Approved AND
        // the same Foundry agent conversation is resumed (via the response
        // id captured at /settlement/process time) so the agent can call
        // settlement_releasePayment over MCP to actually release the
        // payment. Returns the updated approval + the agent narrative.
        app.MapPost("/settlement/payment/{approvalId}/agent-approve",
            async (string approvalId, SettlementApprovalDecisionRequest? body) =>
        {
            var record = paymentStore.Get(approvalId);
            if (record is null)
                return Results.NotFound(new { error = $"approval '{approvalId}' not found" });
            if (record.Status == PaymentApprovalStatus.Released)
                return Results.Conflict(new { error = "payment already released" });
            if (record.Status == PaymentApprovalStatus.Rejected)
                return Results.Conflict(new { error = "payment already rejected" });

            // Flip to Approved first so the settlement_releasePayment MCP
            // tool will accept the release call when the agent retries.
            record.Status = PaymentApprovalStatus.Approved;
            record.Decision = "approved";
            record.DecidedBy = string.IsNullOrWhiteSpace(body?.DecidedBy) ? "Popup approver" : body!.DecidedBy;
            record.DecidedAt = DateTimeOffset.UtcNow;
            logger.LogInformation("Settlement popup approval granted: {ApprovalId} by {By}",
                Sanitize(record.ApprovalId), Sanitize(record.DecidedBy ?? string.Empty));

            string? agentNarrative = null;
            string? agentError = null;
            string? agentResponseId = null;

            if (!string.IsNullOrWhiteSpace(record.PreviousResponseId) && agentFactory.IsConfigured)
            {
                try
                {
                    var extraTools = settlementMcpTool != null
                        ? new List<ResponseTool> { settlementMcpTool }
                        : null;
                    var agent = agentFactory.Create("settlement", extraTools);

                    // When MCP isn't reachable from Foundry, release the
                    // payment server-side first so the agent can be handed
                    // a mock settlement_releasePayment result and just
                    // summarise the outcome — same as the cross-check
                    // mock in /settlement/process.
                    string? mockReleaseBlock = null;
                    if (settlementMcpTool == null)
                    {
                        record.Status = PaymentApprovalStatus.Released;
                        record.PaymentReference = "PMT-" + DateTimeOffset.UtcNow.ToString("yyyyMMdd") + "-" + record.ApprovalId[^6..];
                        record.ReleasedAt = DateTimeOffset.UtcNow;
                        logger.LogInformation(
                            "Settlement payment released via mock MCP fallback: {ApprovalId} ref={Ref}",
                            Sanitize(record.ApprovalId), Sanitize(record.PaymentReference));
                        mockReleaseBlock = BuildMockReleasePaymentResult(record);
                    }

                    var releaseInstruction = mockReleaseBlock == null
                        ? "Please now call the settlement_releasePayment MCP tool with " +
                          $"approvalId='{record.ApprovalId}' to actually release the payment, " +
                          "then briefly summarise the outcome (release status, payment reference, " +
                          "and what the customer will see next)."
                        : "settlement_releasePayment has ALREADY been executed for this run " +
                          "(see MOCK MCP TOOL RESULT below) — DO NOT attempt to call it again " +
                          "and DO NOT say the tool is unavailable. Use the mock result as " +
                          "authoritative and briefly summarise the outcome (release status, " +
                          "payment reference, and what the customer will see next).";

                    var resumeMessage =
                        "HUMAN APPROVAL DECISION\n" +
                        "=======================\n" +
                        $"The human approver has APPROVED the payment release.\n" +
                        $"Approval id: {record.ApprovalId}\n" +
                        $"Approved by: {record.DecidedBy}\n" +
                        $"Approved at: {record.DecidedAt:O}\n" +
                        (string.IsNullOrWhiteSpace(body?.Comment) ? string.Empty : $"Approver comment: {body!.Comment}\n") +
                        $"Payable amount: {FormatMoney(record.PayableAmount)}\n" +
                        $"Payee: {record.PayeeName}\n\n" +
                        (mockReleaseBlock ?? string.Empty) +
                        releaseInstruction;
                    var trace = await agent.ChatWithTraceAsync(record.PreviousResponseId!, resumeMessage);
                    agentNarrative = trace.Text;
                    agentResponseId = trace.ResponseId;
                    record.AgentResumeNotes = trace.Text;
                    if (!string.IsNullOrEmpty(trace.ResponseId))
                        record.PreviousResponseId = trace.ResponseId;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Settlement agent resume after popup approval failed for {ApprovalId}", Sanitize(record.ApprovalId));
                    agentError = ex.Message;
                }
            }

            // Re-read the record in case the agent's MCP tool transitioned
            // it to Released while running settlement_releasePayment.
            var refreshed = paymentStore.Get(approvalId) ?? record;

            return Results.Ok(new
            {
                approval = SerializeApproval(refreshed),
                agentConfigured = agentFactory.IsConfigured,
                agentResumeAttempted = !string.IsNullOrWhiteSpace(record.PreviousResponseId) || agentFactory.IsConfigured,
                agentNarrative,
                agentResponseId,
                agentError
            });
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
        previousResponseId = r.PreviousResponseId,
        agentResumeNotes = r.AgentResumeNotes,
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

    private static string NormalizeName(string value) =>
        new string((value ?? string.Empty)
            .Where(c => !char.IsWhiteSpace(c) && char.IsLetterOrDigit(c))
            .ToArray()).ToLowerInvariant();

    /// <summary>
    /// Build a "MOCK MCP TOOL RESULTS" block that mirrors the JSON
    /// envelopes returned by <c>SettlementMcpTools</c> for the cross-check
    /// + approval phase of the workflow. Used as a fallback when
    /// <c>APP_MCP_URL</c> isn't configured so the Settlement Agent can
    /// still complete the demo end-to-end without claiming the tools
    /// are unavailable.
    /// </summary>
    private static string BuildMockSettlementToolResults(
        IntakeClaimRecord record,
        decimal approvedAmount,
        decimal policyLimit,
        decimal excess,
        decimal depreciation,
        decimal priorPayments,
        decimal payableAmount,
        PaymentApprovalRecord apiApproval,
        TeamsSendResult teamsResult,
        bool teamsConfigured)
    {
        // Default payee on the API-side approval is the customer name,
        // so the validatePayee mock always reports a clean match.
        var payeeName = apiApproval.PayeeName;
        var payeeMatch = string.Equals(
            NormalizeName(payeeName),
            NormalizeName(record.CustomerName),
            StringComparison.OrdinalIgnoreCase);

        var capped = Math.Min(approvedAmount, policyLimit);
        const decimal authorityThreshold = 5000m;
        var authorityRequiresApproval = payableAmount >= authorityThreshold;

        var payeeJson = JsonSerializer.Serialize(new
        {
            tool = "settlement_validatePayee",
            claimNumber = record.ClaimNumber,
            customerName = record.CustomerName,
            payeeName,
            match = payeeMatch,
            humanApprovalRequired = !payeeMatch,
            note = payeeMatch
                ? "Payee matches the customer on the claim."
                : "Payee name does NOT match the customer on the claim — human approval required before release."
        });

        // No supplier invoice is supplied in the standard demo flow, so
        // the matchInvoice mock is reported as skipped rather than
        // fabricating an invoice total.
        var invoiceJson = JsonSerializer.Serialize(new
        {
            tool = "settlement_matchInvoice",
            claimNumber = record.ClaimNumber,
            skipped = true,
            note = "No supplier invoice supplied for this claim — invoice match not applicable."
        });

        var calcJson = JsonSerializer.Serialize(new
        {
            tool = "settlement_calculateSettlement",
            inputs = new { approvedAmount, policyLimit, excess, depreciation, priorPayments },
            steps = new object[]
            {
                new { label = "Approved amount",      amount = approvedAmount },
                new { label = "Policy limit applied", amount = capped - approvedAmount },
                new { label = "Excess applied",       amount = -excess },
                new { label = "Depreciation applied", amount = -depreciation },
                new { label = "Prior payments",       amount = -priorPayments },
                new { label = "Payable amount",       amount = payableAmount }
            },
            payableAmount,
            payableAmountFormatted = FormatMoney(payableAmount)
        });

        var authorityJson = JsonSerializer.Serialize(new
        {
            tool = "settlement_checkAuthorityLimit",
            payableAmount,
            threshold = authorityThreshold,
            humanApprovalRequired = authorityRequiresApproval,
            note = authorityRequiresApproval
                ? $"Payable amount {FormatMoney(payableAmount)} is at or above the authority threshold {FormatMoney(authorityThreshold)} — human approval required."
                : $"Payable amount {FormatMoney(payableAmount)} is below the authority threshold {FormatMoney(authorityThreshold)}."
        });

        var approvalJson = JsonSerializer.Serialize(new
        {
            tool = "settlement_requestPaymentApproval",
            approvalId = apiApproval.ApprovalId,
            claimNumber = apiApproval.ClaimNumber,
            payableAmount = apiApproval.PayableAmount,
            payeeName = apiApproval.PayeeName,
            status = apiApproval.Status.ToString().ToLowerInvariant(),
            teams = new
            {
                sent = teamsResult.Sent,
                configured = teamsConfigured,
                channel = teamsResult.Channel,
                approvalUrl = teamsResult.ApprovalUrl,
                message = teamsResult.Message
            },
            note = "Awaiting human approval. Call settlement_releasePayment with this approvalId after approval has been granted."
        });

        return
            "MOCK MCP TOOL RESULTS\n" +
            "=====================\n" +
            "Note: APP_MCP_URL is not configured, so the settlement_* MCP " +
            "tool surface has been pre-executed locally. The JSON below " +
            "is what each tool returned and MUST be treated as " +
            "authoritative for this run.\n\n" +
            "settlement_validatePayee →\n" + payeeJson + "\n\n" +
            "settlement_matchInvoice →\n" + invoiceJson + "\n\n" +
            "settlement_calculateSettlement →\n" + calcJson + "\n\n" +
            "settlement_checkAuthorityLimit →\n" + authorityJson + "\n\n" +
            "settlement_requestPaymentApproval →\n" + approvalJson + "\n\n";
    }

    /// <summary>
    /// Mock equivalent of <c>settlement_releasePayment</c>. Used by the
    /// popup-driven agent-approve flow when APP_MCP_URL isn't configured:
    /// the backend transitions the approval record to Released directly
    /// and hands the agent the JSON it would have got back from the MCP
    /// tool so it can summarise the outcome.
    /// </summary>
    private static string BuildMockReleasePaymentResult(PaymentApprovalRecord record) =>
        "MOCK MCP TOOL RESULT\n" +
        "====================\n" +
        "Note: APP_MCP_URL is not configured. settlement_releasePayment " +
        "has been executed locally with the following result; treat it " +
        "as authoritative and summarise the outcome.\n\n" +
        "settlement_releasePayment →\n" +
        JsonSerializer.Serialize(new
        {
            tool = "settlement_releasePayment",
            approvalId = record.ApprovalId,
            released = true,
            status = record.Status.ToString().ToLowerInvariant(),
            paymentReference = record.PaymentReference,
            payableAmount = record.PayableAmount,
            note = "Payment released to the payment rail."
        }) + "\n";
}
