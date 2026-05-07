using System.ComponentModel;
using System.Text.Json;
using ModelContextProtocol.Server;

namespace ZavaClaims.App.Mcp;

/// <summary>
/// MCP tool surface that owns Microsoft Teams notifications for the
/// Settlement payment-approval flow. Replaces the previous webhook-URL
/// based <c>TeamsNotificationService</c> with a dedicated, agent-callable
/// MCP tool: the agent (or any in-process caller) invokes
/// <c>teams_sendApprovalCard</c> and gets back a deterministic result
/// describing where the card was delivered.
///
/// For the demo this is a simulated delivery — the Adaptive Card payload
/// is built and logged, and the tool returns a synthetic <c>sent=true</c>
/// envelope so the UI flow always works end-to-end without external
/// infra. Swapping in a real Teams sender later just means replacing the
/// implementation of <see cref="SendApprovalCardCoreAsync"/>.
/// </summary>
[McpServerToolType]
public class TeamsMcpTools
{
    private const string DemoChannel = "demo-teams-mcp";
    private const string DefaultApprovalBase = "/agents/settlement";

    private readonly ILogger<TeamsMcpTools> _logger;

    public TeamsMcpTools(ILogger<TeamsMcpTools> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Whether the Teams sender is considered configured. The simulated
    /// demo implementation always reports configured so the UI surfaces
    /// a successful delivery rather than a configuration warning.
    /// </summary>
    public bool IsConfigured => true;

    [McpServerTool(Name = "teams_sendApprovalCard"),
     Description("Post a Microsoft Teams Adaptive Card asking a human approver to review and approve a payment release. Returns a deterministic envelope with the channel and a deep-link approval URL. Call this after settlement_requestPaymentApproval has minted an approvalId.")]
    public async Task<string> SendApprovalCard(
        [Description("Approval id minted by settlement_requestPaymentApproval (e.g. PAY-XXXXXXXXXX).")] string approvalId,
        [Description("Claim number the payment is for.")] string claimNumber,
        [Description("Customer name on the claim.")] string customerName,
        [Description("Policy number on the claim.")] string policyNumber,
        [Description("Claim type (Home, Motor, Travel, Business, Life).")] string claimType,
        [Description("Payable amount in AUD (decimal).")] decimal payableAmount,
        [Description("Name of the payee that the payment will be released to.")] string payeeName,
        [Description("Bank account / payment destination identifier (optional).")] string? payeeAccount = null,
        [Description("Free-text reason / cross-check summary to show on the Teams card.")] string? reason = null)
    {
        if (string.IsNullOrWhiteSpace(approvalId)) return Error("approvalId is required.");
        if (string.IsNullOrWhiteSpace(claimNumber)) return Error("claimNumber is required.");
        if (string.IsNullOrWhiteSpace(payeeName)) return Error("payeeName is required.");
        if (payableAmount <= 0m) return Error("payableAmount must be greater than zero.");

        var result = await SendApprovalCardCoreAsync(new TeamsApprovalCardRequest(
            ApprovalId: approvalId,
            ClaimNumber: claimNumber,
            CustomerName: customerName ?? string.Empty,
            PolicyNumber: policyNumber ?? string.Empty,
            ClaimType: claimType ?? string.Empty,
            PayableAmount: payableAmount,
            PayeeName: payeeName,
            PayeeAccount: payeeAccount,
            Reason: reason));

        return Json(new
        {
            tool = "teams_sendApprovalCard",
            approvalId,
            claimNumber,
            sent = result.Sent,
            channel = result.Channel,
            approvalUrl = result.ApprovalUrl,
            message = result.Message
        });
    }

    /// <summary>
    /// In-process entry point used by <c>SettlementMcpTools</c> and the
    /// <c>SettlementApi</c> HTTP layer to drive the same logic the MCP
    /// tool exposes. Keeps the Adaptive Card construction in one place
    /// and lets non-MCP callers (e.g. the deterministic API fallback)
    /// share the result shape.
    /// </summary>
    public Task<TeamsCardSendResult> SendApprovalCardCoreAsync(
        TeamsApprovalCardRequest request,
        CancellationToken cancellationToken = default)
    {
        var approvalUrl = BuildApprovalUrl(request.ApprovalId);
        var card = BuildAdaptiveCard(request, approvalUrl);

        // Demo behaviour: log the Adaptive Card payload and report a
        // synthetic successful delivery to the demo Teams channel so the
        // page UI shows "Adaptive Card posted" rather than a configuration
        // warning. A real implementation would post `card` to a Teams
        // Incoming Webhook here.
        _logger.LogInformation(
            "teams_sendApprovalCard: simulated delivery. approvalId={ApprovalId} claim={ClaimNumber} amount={Amount} channel={Channel}",
            Sanitize(request.ApprovalId), Sanitize(request.ClaimNumber), request.PayableAmount, DemoChannel);

        if (_logger.IsEnabled(LogLevel.Debug))
        {
            _logger.LogDebug(
                "teams_sendApprovalCard payload for {ApprovalId}: {Payload}",
                Sanitize(request.ApprovalId),
                JsonSerializer.Serialize(card));
        }

        return Task.FromResult(new TeamsCardSendResult(
            Sent: true,
            Channel: DemoChannel,
            ApprovalUrl: approvalUrl,
            Message: $"Adaptive Card posted to {DemoChannel} for payment {request.ApprovalId}."));
    }

    private static string BuildApprovalUrl(string approvalId) =>
        $"{DefaultApprovalBase}?approvalId={Uri.EscapeDataString(approvalId)}";

    private static object BuildAdaptiveCard(TeamsApprovalCardRequest request, string approvalUrl)
    {
        var amountText = request.PayableAmount.ToString("C0", System.Globalization.CultureInfo.GetCultureInfo("en-AU"));
        return new
        {
            type = "message",
            attachments = new[]
            {
                new
                {
                    contentType = "application/vnd.microsoft.card.adaptive",
                    contentUrl = (string?)null,
                    content = new
                    {
                        @schema = "http://adaptivecards.io/schemas/adaptive-card.json",
                        type = "AdaptiveCard",
                        version = "1.4",
                        msteams = new { width = "Full" },
                        body = new object[]
                        {
                            new
                            {
                                type = "TextBlock",
                                size = "Large",
                                weight = "Bolder",
                                text = $"💳 Payment approval required — {request.ClaimNumber}"
                            },
                            new
                            {
                                type = "TextBlock",
                                spacing = "None",
                                isSubtle = true,
                                wrap = true,
                                text = $"Zava Insurance · Settlement Agent (Seth) · Approval id {request.ApprovalId}"
                            },
                            new
                            {
                                type = "FactSet",
                                facts = new object[]
                                {
                                    new { title = "Customer",     value = request.CustomerName },
                                    new { title = "Policy",       value = request.PolicyNumber },
                                    new { title = "Claim type",   value = request.ClaimType },
                                    new { title = "Payable",      value = amountText },
                                    new { title = "Payee",        value = request.PayeeName },
                                    new { title = "Account",      value = MaskAccount(request.PayeeAccount) }
                                }
                            },
                            new
                            {
                                type = "TextBlock",
                                wrap = true,
                                text = string.IsNullOrWhiteSpace(request.Reason)
                                    ? "Cross-checks completed by the Settlement Agent. Please review and approve to release payment."
                                    : request.Reason
                            }
                        },
                        actions = new object[]
                        {
                            new
                            {
                                type = "Action.OpenUrl",
                                title = "Review & approve in Zava Claims",
                                url = approvalUrl
                            }
                        }
                    }
                }
            }
        };
    }

    private static string MaskAccount(string? account)
    {
        if (string.IsNullOrWhiteSpace(account)) return "(not provided)";
        var trimmed = account.Trim();
        if (trimmed.Length <= 4) return new string('•', trimmed.Length);
        return new string('•', trimmed.Length - 4) + trimmed[^4..];
    }

    private static string Json(object payload) =>
        JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false });

    private static string Error(string message) =>
        Json(new { error = message });

    private static string Sanitize(string value) =>
        (value ?? string.Empty).Replace('\r', ' ').Replace('\n', ' ');
}

/// <summary>Input record for <see cref="TeamsMcpTools.SendApprovalCardCoreAsync"/>.</summary>
public record TeamsApprovalCardRequest(
    string ApprovalId,
    string ClaimNumber,
    string CustomerName,
    string PolicyNumber,
    string ClaimType,
    decimal PayableAmount,
    string PayeeName,
    string? PayeeAccount,
    string? Reason);

/// <summary>Result envelope returned by <see cref="TeamsMcpTools.SendApprovalCardCoreAsync"/>.</summary>
public record TeamsCardSendResult(bool Sent, string Channel, string ApprovalUrl, string Message);
