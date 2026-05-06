using System.ComponentModel;
using System.Globalization;
using System.Text.Json;
using ModelContextProtocol.Server;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Mcp;

/// <summary>
/// MCP tool surface for the Settlement Agent. Exposes the payment-flow
/// automation primitives Seth uses to settle a claim: cross-checking the
/// inputs (payee, invoice, authority limit), running the settlement maths,
/// raising a payment-approval request that goes to Microsoft Teams, and
/// finally releasing the payment once a human has approved it.
///
/// Every tool here is deterministic and side-effect free except for
/// <see cref="RequestPaymentApproval"/> (creates a record + Teams card)
/// and <see cref="ReleasePayment"/> (transitions the record to Released).
/// The Settlement Agent itself runs with the Foundry MCP tool configured
/// to <c>AlwaysRequireApproval</c>, so even calling these tools surfaces
/// an approval request to the operator before they execute.
/// </summary>
[McpServerToolType]
public class SettlementMcpTools
{
    private readonly IntakeClaimStore _claimStore;
    private readonly PaymentApprovalStore _paymentStore;
    private readonly TeamsNotificationService _teams;
    private readonly ILogger<SettlementMcpTools> _logger;

    public SettlementMcpTools(
        IntakeClaimStore claimStore,
        PaymentApprovalStore paymentStore,
        TeamsNotificationService teams,
        ILogger<SettlementMcpTools> logger)
    {
        _claimStore = claimStore;
        _paymentStore = paymentStore;
        _teams = teams;
        _logger = logger;
    }

    [McpServerTool(Name = "settlement_validatePayee"),
     Description("Validate that the payee name on the payment matches the customer recorded on the claim. Use this before requesting payment approval.")]
    public string ValidatePayee(
        [Description("Claim number minted at intake (e.g. ZC-2025-000123).")] string claimNumber,
        [Description("Name of the payee that the payment will be released to.")] string payeeName)
    {
        if (string.IsNullOrWhiteSpace(claimNumber)) return Error("claimNumber is required.");
        if (string.IsNullOrWhiteSpace(payeeName)) return Error("payeeName is required.");

        var record = _claimStore.Get(claimNumber);
        if (record is null) return Error($"claim '{claimNumber}' not found.");

        var match = string.Equals(
            Normalize(payeeName), Normalize(record.CustomerName), StringComparison.OrdinalIgnoreCase);

        return Json(new
        {
            tool = "settlement_validatePayee",
            claimNumber = record.ClaimNumber,
            customerName = record.CustomerName,
            payeeName,
            match,
            humanApprovalRequired = !match,
            note = match
                ? "Payee matches the customer on the claim."
                : "Payee name does NOT match the customer on the claim — human approval required before release."
        });
    }

    [McpServerTool(Name = "settlement_matchInvoice"),
     Description("Match a supplier invoice total against the approved scope on the claim. Returns whether the invoice is within tolerance and any variance.")]
    public string MatchInvoice(
        [Description("Claim number the invoice belongs to.")] string claimNumber,
        [Description("Invoice total (in AUD, decimal).")] decimal invoiceTotal,
        [Description("Approved scope total (in AUD, decimal). If omitted, the claim's estimated loss is used.")] decimal? approvedTotal = null,
        [Description("Allowed variance percentage as a fraction (e.g. 0.05 for 5%).")] double tolerance = 0.05)
    {
        if (string.IsNullOrWhiteSpace(claimNumber)) return Error("claimNumber is required.");
        var record = _claimStore.Get(claimNumber);
        if (record is null) return Error($"claim '{claimNumber}' not found.");

        var approved = approvedTotal ?? ParseMoney(record.EstimatedLoss) ?? 0m;
        if (approved <= 0m) return Error("approvedTotal could not be determined for this claim.");

        var variance = invoiceTotal - approved;
        var variancePct = (double)(variance / approved);
        var withinTolerance = Math.Abs(variancePct) <= tolerance;

        return Json(new
        {
            tool = "settlement_matchInvoice",
            claimNumber = record.ClaimNumber,
            invoiceTotal,
            approvedTotal = approved,
            variance,
            variancePct,
            tolerance,
            withinTolerance,
            humanApprovalRequired = !withinTolerance,
            note = withinTolerance
                ? "Invoice total is within the approved-scope tolerance."
                : "Invoice total is OUTSIDE tolerance — escalate to the Settlement Officer before release."
        });
    }

    [McpServerTool(Name = "settlement_checkAuthorityLimit"),
     Description("Check a payable amount against the Settlement Officer authority limit. Amounts at or above the threshold always require human approval.")]
    public string CheckAuthorityLimit(
        [Description("Payable amount in AUD.")] decimal payableAmount,
        [Description("Authority threshold in AUD. Defaults to 5000.")] decimal threshold = 5000m)
    {
        var requiresApproval = payableAmount >= threshold;
        return Json(new
        {
            tool = "settlement_checkAuthorityLimit",
            payableAmount,
            threshold,
            humanApprovalRequired = requiresApproval,
            note = requiresApproval
                ? $"Payable amount {Format(payableAmount)} is at or above the authority threshold {Format(threshold)} — human approval required."
                : $"Payable amount {Format(payableAmount)} is below the authority threshold {Format(threshold)}."
        });
    }

    [McpServerTool(Name = "settlement_calculateSettlement"),
     Description("Run the settlement calculation transparently: payable = min(approved, policyLimit) - excess - depreciation - priorPayments (floored at 0).")]
    public string CalculateSettlement(
        [Description("Approved amount (claim scope).")] decimal approvedAmount,
        [Description("Policy limit applicable to this claim.")] decimal policyLimit,
        [Description("Excess / deductible.")] decimal excess = 0m,
        [Description("Depreciation applied.")] decimal depreciation = 0m,
        [Description("Prior payments already released against this claim.")] decimal priorPayments = 0m)
    {
        var capped = Math.Min(approvedAmount, policyLimit);
        var payable = Math.Max(0m, capped - excess - depreciation - priorPayments);

        return Json(new
        {
            tool = "settlement_calculateSettlement",
            inputs = new { approvedAmount, policyLimit, excess, depreciation, priorPayments },
            steps = new object[]
            {
                new { label = "Approved amount",        amount = approvedAmount },
                new { label = "Policy limit applied",   amount = capped - approvedAmount },
                new { label = "Excess applied",         amount = -excess },
                new { label = "Depreciation applied",   amount = -depreciation },
                new { label = "Prior payments",         amount = -priorPayments },
                new { label = "Payable amount",         amount = payable }
            },
            payableAmount = payable,
            payableAmountFormatted = Format(payable)
        });
    }

    [McpServerTool(Name = "settlement_requestPaymentApproval"),
     Description("Raise a payment-approval request and post an Adaptive Card to Microsoft Teams so a human can approve or reject release. Returns the approvalId; this MUST be called before releasePayment.")]
    public async Task<string> RequestPaymentApproval(
        [Description("Claim number the payment is for.")] string claimNumber,
        [Description("Payable amount in AUD.")] decimal payableAmount,
        [Description("Name of the payee.")] string payeeName,
        [Description("Bank account / payment destination identifier.")] string? payeeAccount = null,
        [Description("Free-text reason / cross-check summary to show in the Teams card.")] string? reason = null)
    {
        if (string.IsNullOrWhiteSpace(claimNumber)) return Error("claimNumber is required.");
        if (payableAmount <= 0m) return Error("payableAmount must be greater than zero.");
        if (string.IsNullOrWhiteSpace(payeeName)) return Error("payeeName is required.");

        var record = _claimStore.Get(claimNumber);
        if (record is null) return Error($"claim '{claimNumber}' not found.");

        var approvalId = "PAY-" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
        var stored = _paymentStore.Add(new PaymentApprovalRecord
        {
            ApprovalId = approvalId,
            ClaimNumber = record.ClaimNumber,
            CustomerName = record.CustomerName,
            PolicyNumber = record.PolicyNumber,
            ClaimType = record.ClaimType,
            PayableAmount = payableAmount,
            PayeeName = payeeName,
            PayeeAccount = payeeAccount,
            Reason = reason,
            Status = PaymentApprovalStatus.Pending
        });

        var teamsResult = await _teams.SendPaymentApprovalAsync(new PaymentApprovalRequest(
            ApprovalId: stored.ApprovalId,
            ClaimNumber: stored.ClaimNumber,
            CustomerName: stored.CustomerName,
            PolicyNumber: stored.PolicyNumber,
            ClaimType: stored.ClaimType,
            PayableAmount: stored.PayableAmount,
            PayeeName: stored.PayeeName,
            PayeeAccount: stored.PayeeAccount,
            Reason: stored.Reason));

        stored.TeamsChannel = teamsResult.Channel;
        stored.TeamsMessage = teamsResult.Message;
        stored.ApprovalUrl = teamsResult.ApprovalUrl;

        _logger.LogInformation(
            "Settlement payment approval requested: id={ApprovalId} claim={ClaimNumber} amount={Amount} teamsSent={TeamsSent}",
            Sanitize(stored.ApprovalId), Sanitize(stored.ClaimNumber), stored.PayableAmount, teamsResult.Sent);

        return Json(new
        {
            tool = "settlement_requestPaymentApproval",
            approvalId = stored.ApprovalId,
            claimNumber = stored.ClaimNumber,
            payableAmount = stored.PayableAmount,
            payeeName = stored.PayeeName,
            status = stored.Status.ToString().ToLowerInvariant(),
            teams = new
            {
                sent = teamsResult.Sent,
                channel = teamsResult.Channel,
                approvalUrl = teamsResult.ApprovalUrl,
                message = teamsResult.Message
            },
            note = "Awaiting human approval. Call settlement_releasePayment with this approvalId after approval has been granted."
        });
    }

    [McpServerTool(Name = "settlement_getApprovalStatus"),
     Description("Look up the current status of a payment-approval request created by requestPaymentApproval.")]
    public string GetApprovalStatus(
        [Description("Approval id returned by requestPaymentApproval.")] string approvalId)
    {
        if (string.IsNullOrWhiteSpace(approvalId)) return Error("approvalId is required.");
        var record = _paymentStore.Get(approvalId);
        if (record is null) return Error($"approval '{approvalId}' not found.");

        return Json(new
        {
            tool = "settlement_getApprovalStatus",
            approvalId = record.ApprovalId,
            claimNumber = record.ClaimNumber,
            payableAmount = record.PayableAmount,
            status = record.Status.ToString().ToLowerInvariant(),
            decision = record.Decision,
            decidedBy = record.DecidedBy,
            decidedAt = record.DecidedAt,
            paymentReference = record.PaymentReference,
            releasedAt = record.ReleasedAt
        });
    }

    [McpServerTool(Name = "settlement_releasePayment"),
     Description("Release the payment for a previously-approved request. Fails unless the approval is in the Approved state. Never call this without prior human approval.")]
    public string ReleasePayment(
        [Description("Approval id returned by requestPaymentApproval.")] string approvalId)
    {
        if (string.IsNullOrWhiteSpace(approvalId)) return Error("approvalId is required.");
        var record = _paymentStore.Get(approvalId);
        if (record is null) return Error($"approval '{approvalId}' not found.");

        if (record.Status == PaymentApprovalStatus.Pending)
        {
            return Json(new
            {
                tool = "settlement_releasePayment",
                approvalId = record.ApprovalId,
                released = false,
                status = record.Status.ToString().ToLowerInvariant(),
                note = "Payment is still awaiting human approval. Wait for the Teams approver to act before retrying."
            });
        }
        if (record.Status == PaymentApprovalStatus.Rejected)
        {
            return Json(new
            {
                tool = "settlement_releasePayment",
                approvalId = record.ApprovalId,
                released = false,
                status = record.Status.ToString().ToLowerInvariant(),
                note = "Payment was rejected by the approver. Do not release."
            });
        }
        if (record.Status == PaymentApprovalStatus.Released)
        {
            return Json(new
            {
                tool = "settlement_releasePayment",
                approvalId = record.ApprovalId,
                released = true,
                status = record.Status.ToString().ToLowerInvariant(),
                paymentReference = record.PaymentReference,
                note = "Payment had already been released."
            });
        }

        // Approved → Released. Generate a deterministic-looking payment ref.
        var paymentRef = "PMT-" + DateTimeOffset.UtcNow.ToString("yyyyMMdd") + "-" + record.ApprovalId[^6..];
        record.Status = PaymentApprovalStatus.Released;
        record.PaymentReference = paymentRef;
        record.ReleasedAt = DateTimeOffset.UtcNow;

        _logger.LogInformation(
            "Settlement payment released: id={ApprovalId} ref={PaymentReference} amount={Amount}",
            Sanitize(record.ApprovalId), Sanitize(paymentRef), record.PayableAmount);

        return Json(new
        {
            tool = "settlement_releasePayment",
            approvalId = record.ApprovalId,
            released = true,
            status = record.Status.ToString().ToLowerInvariant(),
            paymentReference = paymentRef,
            payableAmount = record.PayableAmount,
            note = "Payment released to the payment rail."
        });
    }

    private static string Json(object payload) =>
        JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false });

    private static string Error(string message) =>
        Json(new { error = message });

    private static decimal? ParseMoney(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var cleaned = new string(value.Where(c => char.IsDigit(c) || c == '.' || c == '-').ToArray());
        if (string.IsNullOrEmpty(cleaned)) return null;
        return decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    private static string Format(decimal amount) =>
        amount.ToString("C0", CultureInfo.GetCultureInfo("en-AU"));

    private static string Normalize(string value) =>
        new string((value ?? string.Empty).Where(c => !char.IsWhiteSpace(c) && char.IsLetterOrDigit(c)).ToArray()).ToLowerInvariant();

    private static string Sanitize(string value) =>
        (value ?? string.Empty).Replace('\r', ' ').Replace('\n', ' ');
}
