using System.Globalization;
using ZavaClaims.Agents;
using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

record TeamLeaderProcessRequest(string ClaimNumber);

/// <summary>
/// HTTP endpoints that back the "Try It Out" tab on the Team Leader agent
/// page (<c>/agents/team-leader</c>). Theo's team-leader agent picks up
/// claims that were minted by the Claims Intake demo and held in
/// <see cref="IntakeClaimStore"/>, then summarises status, flags risks, and
/// proposes a next-best-action across all claim stages.
/// </summary>
public static class TeamLeaderApi
{
    public static void MapTeamLeaderEndpoints(
        this WebApplication app,
        IntakeClaimStore claimStore,
        ClaimsAgentFactory agentFactory,
        ILogger logger)
    {
        // List of claims currently held in memory by the intake demo, so the
        // Try It Out tab can populate its claim-number dropdown.
        app.MapGet("/team-leader/claims", () =>
        {
            var claims = claimStore.All().Select(c => new
            {
                claimNumber = c.ClaimNumber,
                customerName = c.CustomerName,
                claimType = c.ClaimType,
                policyNumber = c.PolicyNumber,
                urgency = c.Urgency,
                createdAt = c.CreatedAt
            });
            return Results.Ok(claims);
        });

        // Engage the Team Leader Agent on a single claim that was minted by
        // the intake demo. The agent reviews the case, flags SLA / quality /
        // vulnerability risks and proposes a next-best-action across stages.
        app.MapPost("/team-leader/process", async (TeamLeaderProcessRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.ClaimNumber))
                return Results.BadRequest(new { error = "claimNumber is required" });

            var record = claimStore.Get(request.ClaimNumber);
            if (record is null)
                return Results.NotFound(new { error = $"claim '{request.ClaimNumber}' not found" });

            logger.LogInformation("Team Leader process: claim={ClaimNumber}", Sanitize(record.ClaimNumber));

            // Deterministic demo summary so the tab still works without a
            // configured Foundry endpoint. Mirrors the fallback pattern in
            // IntakeApi: structured fields are computed locally; the live
            // agent's narrative is surfaced as additional notes when
            // available.
            var ageHours = (DateTimeOffset.UtcNow - record.CreatedAt).TotalHours;
            var ageLabel = ageHours < 1
                ? $"{(int)Math.Max(0, (DateTimeOffset.UtcNow - record.CreatedAt).TotalMinutes)} min"
                : ageHours < 48
                    ? $"{ageHours:F1} h"
                    : $"{ageHours / 24:F1} d";

            var slaState = record.Urgency.Equals("High", StringComparison.OrdinalIgnoreCase)
                ? "At risk — high urgency claims target a 4-hour first-touch SLA"
                : record.Urgency.Equals("Medium", StringComparison.OrdinalIgnoreCase)
                    ? "On track — medium urgency targets a 24-hour first-touch SLA"
                    : "Comfortable — low urgency, standard 48-hour first-touch SLA";

            var risks = new List<string>();
            if (record.Urgency.Equals("High", StringComparison.OrdinalIgnoreCase))
                risks.Add("High urgency — vulnerable customer or emergency exposure possible.");
            if (!string.IsNullOrWhiteSpace(record.UrgencyReason))
                risks.Add(record.UrgencyReason);
            if (string.IsNullOrWhiteSpace(record.PolicyNumber))
                risks.Add("Policy number missing — confirm coverage before downstream hand-offs.");
            if (string.IsNullOrWhiteSpace(record.IncidentDate))
                risks.Add("Incident date missing — Loss Adjusting needs this to scope inspection.");
            if (risks.Count == 0)
                risks.Add("No material risks detected; standard hand-off path applies.");

            var nextAction = record.Urgency.Equals("High", StringComparison.OrdinalIgnoreCase)
                ? "Fast-track to Claims Assessment with a vulnerable-customer flag, then notify Customer Communications for a same-day call-back."
                : "Hand off to Claims Assessment for coverage review; Customer Communications to send acknowledgement email.";

            var stages = new[]
            {
                new { stage = "Claims Intake",        status = "Completed",   note = $"Claim lodged {ageLabel} ago by Iris's intake agent." },
                new { stage = "Claims Assessment",    status = "In progress", note = "Coverage review pending; awaiting Marcus's assessment agent." },
                new { stage = "Loss Adjusting",       status = "Queued",      note = "Triggered only if assessment flags complex damage." },
                new { stage = "Fraud Investigation",  status = "Queued",      note = "Standby — only engaged on suspicious indicators." },
                new { stage = "Supplier Coordination",status = "Queued",      note = "Awaiting assessment outcome before tasking suppliers." },
                new { stage = "Settlement",           status = "Queued",      note = "Pending coverage decision." },
                new { stage = "Customer Communications", status = "Queued",   note = "Acknowledgement scheduled after assessment hand-off." }
            };

            string? agentNotes = null;
            if (agentFactory.IsConfigured)
            {
                try
                {
                    var brief =
                        "TEAM LEADER REVIEW — CLAIM CASE\n" +
                        "================================\n" +
                        $"Claim number     : {record.ClaimNumber}\n" +
                        $"Lodged           : {record.CreatedAt.ToString("u", CultureInfo.InvariantCulture)} ({ageLabel} ago)\n" +
                        $"Customer         : {record.CustomerName}\n" +
                        $"Customer email   : {record.CustomerEmail}\n" +
                        $"Customer phone   : {record.CustomerPhone}\n" +
                        $"Policy number    : {record.PolicyNumber}\n" +
                        $"Claim type       : {record.ClaimType}\n" +
                        $"Incident date    : {record.IncidentDate}\n" +
                        $"Incident location: {record.IncidentLocation}\n" +
                        $"Estimated loss   : {record.EstimatedLoss}\n" +
                        $"Preferred contact: {record.PreferredContact}\n" +
                        $"Urgency          : {record.Urgency}\n" +
                        $"Urgency reason   : {record.UrgencyReason}\n\n" +
                        "Incident description:\n" +
                        record.IncidentDescription + "\n\n" +
                        "Stages so far: only Claims Intake is complete; downstream stages are queued.\n" +
                        "As the Team Leader Agent, summarise case status, flag escalation / SLA / quality risks, " +
                        "and propose the next-best-action for the team.";

                    var agent = agentFactory.Create("team-leader");
                    var result = await agent.RunAsync(brief);
                    agentNotes = result.Text;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Team Leader Agent invocation failed; falling back to deterministic demo summary");
                }
            }

            return Results.Ok(new
            {
                claimNumber = record.ClaimNumber,
                customerName = record.CustomerName,
                claimType = record.ClaimType,
                policyNumber = record.PolicyNumber,
                urgency = record.Urgency,
                urgencyReason = record.UrgencyReason,
                ageLabel,
                slaState,
                risks,
                nextAction,
                stages,
                agentNotes,
                agentConfigured = agentFactory.IsConfigured
            });
        });
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}
