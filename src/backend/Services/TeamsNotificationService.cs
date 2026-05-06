using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace ZavaClaims.App.Services;

/// <summary>
/// Sends Microsoft Teams notifications for the Settlement payment-approval
/// flow. Uses an Incoming Webhook URL (Adaptive Card v1.4 payload) so the
/// approval message lands in a configured Teams channel and a human can
/// approve or reject the payment from inside Teams.
///
/// When <c>TEAMS_WEBHOOK_URL</c> is not configured the service logs the
/// payload and returns a friendly message — the demo flow keeps working
/// end-to-end without external infra.
/// </summary>
public class TeamsNotificationService
{
    private readonly ILogger<TeamsNotificationService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string? _webhookUrl;
    private readonly string? _approvalBaseUrl;

    public TeamsNotificationService(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<TeamsNotificationService> logger)
    {
        _logger = logger;
        _httpClientFactory = httpClientFactory;
        _webhookUrl = configuration["TEAMS_WEBHOOK_URL"];
        _approvalBaseUrl = configuration["SETTLEMENT_APPROVAL_BASE_URL"];
    }

    /// <summary>True when a Teams Incoming Webhook URL is configured.</summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_webhookUrl);

    /// <summary>
    /// Posts an Adaptive Card to the configured Teams channel asking for
    /// human approval of a payment. The card includes a deep link back to
    /// the Settlement page where the user can review and approve / reject.
    /// </summary>
    public async Task<TeamsSendResult> SendPaymentApprovalAsync(PaymentApprovalRequest request, CancellationToken cancellationToken = default)
    {
        var approvalUrl = BuildApprovalUrl(request.ApprovalId);
        var card = BuildAdaptiveCard(request, approvalUrl);

        if (!IsConfigured)
        {
            _logger.LogInformation(
                "Teams webhook not configured; skipping send. ApprovalId={ApprovalId} Claim={ClaimNumber} Amount={Amount}",
                Sanitize(request.ApprovalId), Sanitize(request.ClaimNumber), request.PayableAmount);
            return new TeamsSendResult(
                Sent: false,
                Channel: "(not configured)",
                ApprovalUrl: approvalUrl,
                Message: "Teams webhook not configured (set TEAMS_WEBHOOK_URL); approval card was logged only.");
        }

        try
        {
            var http = _httpClientFactory.CreateClient(nameof(TeamsNotificationService));
            using var response = await http.PostAsJsonAsync(_webhookUrl, card, cancellationToken);
            response.EnsureSuccessStatusCode();
            _logger.LogInformation(
                "Sent Teams approval card for {ApprovalId} (claim {ClaimNumber})",
                Sanitize(request.ApprovalId), Sanitize(request.ClaimNumber));
            return new TeamsSendResult(
                Sent: true,
                Channel: "teams-incoming-webhook",
                ApprovalUrl: approvalUrl,
                Message: $"Approval card posted to Teams for payment {request.ApprovalId}.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to post Teams approval card for {ApprovalId}", Sanitize(request.ApprovalId));
            return new TeamsSendResult(
                Sent: false,
                Channel: "teams-incoming-webhook",
                ApprovalUrl: approvalUrl,
                Message: $"Teams post failed: {ex.Message}");
        }
    }

    private string BuildApprovalUrl(string approvalId)
    {
        var baseUrl = string.IsNullOrWhiteSpace(_approvalBaseUrl)
            ? "/agents/settlement"
            : _approvalBaseUrl!.TrimEnd('/');
        return $"{baseUrl}?approvalId={Uri.EscapeDataString(approvalId)}";
    }

    private static object BuildAdaptiveCard(PaymentApprovalRequest request, string approvalUrl)
    {
        // Adaptive Card v1.4 payload wrapped in the Teams "MessageCard" attachment envelope.
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

    private static string Sanitize(string value) =>
        (value ?? string.Empty).Replace('\r', ' ').Replace('\n', ' ');
}

public record PaymentApprovalRequest(
    string ApprovalId,
    string ClaimNumber,
    string CustomerName,
    string PolicyNumber,
    string ClaimType,
    decimal PayableAmount,
    string PayeeName,
    string? PayeeAccount,
    string? Reason);

public record TeamsSendResult(bool Sent, string Channel, string ApprovalUrl, string Message);
