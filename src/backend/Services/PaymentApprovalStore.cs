using System.Collections.Concurrent;

namespace ZavaClaims.App.Services;

/// <summary>
/// Status values for a payment that the Settlement Agent has prepared.
/// </summary>
public enum PaymentApprovalStatus
{
    Pending,
    Approved,
    Rejected,
    Released
}

/// <summary>
/// In-memory record of a payment that has been prepared for human approval.
/// Created by the <c>requestPaymentApproval</c> MCP tool, transitioned by
/// the <c>/settlement/payment/{id}/approve|reject</c> HTTP endpoints (which
/// the Teams Adaptive Card buttons can target), and finalised by the
/// <c>releasePayment</c> MCP tool once approval has been granted.
/// </summary>
public class PaymentApprovalRecord
{
    public string ApprovalId { get; init; } = string.Empty;
    public string ClaimNumber { get; init; } = string.Empty;
    public string CustomerName { get; init; } = string.Empty;
    public string PolicyNumber { get; init; } = string.Empty;
    public string ClaimType { get; init; } = string.Empty;
    public decimal PayableAmount { get; init; }
    public string PayeeName { get; init; } = string.Empty;
    public string? PayeeAccount { get; init; }
    public string? Reason { get; init; }
    public string? TeamsChannel { get; set; }
    public string? TeamsMessage { get; set; }
    public string? ApprovalUrl { get; set; }
    public PaymentApprovalStatus Status { get; set; } = PaymentApprovalStatus.Pending;
    public string? Decision { get; set; }
    public string? DecidedBy { get; set; }
    public string? PaymentReference { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DecidedAt { get; set; }
    public DateTimeOffset? ReleasedAt { get; set; }
}

/// <summary>
/// Singleton in-memory store of payment-approval records prepared by the
/// Settlement agent. Distinct from <see cref="PendingApprovalStore"/> which
/// covers the notice-intelligence flow.
/// </summary>
public class PaymentApprovalStore
{
    private readonly ConcurrentDictionary<string, PaymentApprovalRecord> _records = new();

    public PaymentApprovalRecord Add(PaymentApprovalRecord record)
    {
        _records[record.ApprovalId] = record;
        return record;
    }

    public PaymentApprovalRecord? Get(string approvalId) =>
        _records.TryGetValue(approvalId, out var r) ? r : null;

    public IEnumerable<PaymentApprovalRecord> All() =>
        _records.Values.OrderByDescending(r => r.CreatedAt);

    public IEnumerable<PaymentApprovalRecord> ForClaim(string claimNumber) =>
        _records.Values
            .Where(r => string.Equals(r.ClaimNumber, claimNumber, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(r => r.CreatedAt);
}
