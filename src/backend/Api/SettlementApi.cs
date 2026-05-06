using System.Globalization;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record SettlementProcessRequest(
    string ClaimNumber,
    decimal? ApprovedAmount,
    decimal? PolicyLimit,
    decimal? Excess,
    decimal? Depreciation,
    decimal? PriorPayments);

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
        app.MapPost("/settlement/process", async (SettlementProcessRequest request) =>
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

            string? agentNotes = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
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
                        "Please produce the standard settlement output (calculation, " +
                        "options, payment approval request, settlement letter draft, " +
                        "and human-approval decision).";

                    var agent = agentFactory.Create("settlement");
                    var result = await agent.RunAsync(prompt);
                    agentNotes = result.Text;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Settlement Agent invocation failed; falling back to deterministic demo calculation");
                }
            }

            logger.LogInformation("Settlement process: claim={ClaimNumber} payable={Payable}",
                Sanitize(record.ClaimNumber), payable);

            return Results.Ok(new
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
                agentNotes,
                agentConfigured = agentFactory.IsConfigured
            });
        });
    }

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
