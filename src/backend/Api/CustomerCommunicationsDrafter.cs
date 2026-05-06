using ZavaClaims.App.Services;

namespace ZavaClaims.App.Api;

/// <summary>
/// Deterministic draft generator for the Customer Communications "Try It
/// Out" demo. Produces empathetic plain-English drafts across email,
/// SMS, and the customer portal so the demo always has something to show
/// — even when the live Foundry agent is not configured. When the agent
/// IS configured, its narrative is surfaced alongside these drafts.
/// </summary>
internal static class CustomerCommunicationsDrafter
{
    internal record EmailDraft(string Subject, string Body);
    internal record PortalDraft(string Heading, string Body);

    internal record DraftBundle(
        EmailDraft Email,
        string Sms,
        PortalDraft Portal,
        string Summary,
        IReadOnlyList<string> NextSteps,
        IReadOnlyList<string> VulnerabilityFlags,
        bool HumanApprovalRequired,
        string HumanApprovalReason);

    internal static DraftBundle Draft(IntakeClaimRecord r)
    {
        var firstName = FirstName(r.CustomerName);
        var claimType = (r.ClaimType ?? string.Empty).Trim();
        var claimTypeLower = claimType.ToLowerInvariant();
        var urgency = (r.Urgency ?? string.Empty).Trim();
        var isHigh = urgency.Equals("High", StringComparison.OrdinalIgnoreCase);

        // Vulnerability flags — surfaced for human review before sending.
        var flags = new List<string>();
        if (claimTypeLower.Contains("life") || claimTypeLower.Contains("bereavement"))
            flags.Add("Bereavement / life insurance claim — requires compassionate tone and human review.");
        if (isHigh)
            flags.Add("High-urgency case — customer may need emergency support or accommodation.");
        var desc = (r.IncidentDescription ?? string.Empty).ToLowerInvariant();
        if (desc.Contains("alone") || desc.Contains("elderly") || desc.Contains("vulnerable"))
            flags.Add("Description hints at customer vulnerability — review before any automated send.");
        if (desc.Contains("hospital") || desc.Contains("injur"))
            flags.Add("Possible injury context — confirm wellbeing before procedural messaging.");

        var humanApprovalRequired = flags.Count > 0;
        var humanApprovalReason = humanApprovalRequired
            ? "Vulnerability flags detected — these drafts must be reviewed by a human before anything is sent to the customer."
            : "Standard status update — drafts can be spot-checked by a human before sending.";

        // Empathetic opener tuned to claim type.
        var opener = claimTypeLower switch
        {
            var t when t.Contains("life") || t.Contains("bereavement")
                => $"Dear {firstName},\n\nWe're so sorry for your loss. Thank you for letting us know — we'll handle your claim with care and keep things as simple as possible for you.",
            var t when t.Contains("home")
                => $"Hi {firstName},\n\nThanks for getting in touch about your home — we know how unsettling damage to your place can be, and we're on it.",
            var t when t.Contains("motor") || t.Contains("car") || t.Contains("vehicle")
                => $"Hi {firstName},\n\nThanks for reporting your motor claim. We'll keep things moving so you can get back on the road as quickly as possible.",
            var t when t.Contains("travel")
                => $"Hi {firstName},\n\nThanks for letting us know about your travel claim. We know things going wrong away from home is stressful — we'll make this as straightforward as we can.",
            var t when t.Contains("business")
                => $"Hi {firstName},\n\nThanks for reporting your business claim. We'll prioritise getting you back up and running with as little disruption as possible.",
            _ => $"Hi {firstName},\n\nThanks for getting in touch — we've received your claim and we're on it."
        };

        var emailSubject = $"We've received your claim {r.ClaimNumber}";
        var emailBody =
            opener + "\n\n" +
            $"Your claim reference is {r.ClaimNumber}. Here's where things stand right now:\n\n" +
            $"• Claim type: {(string.IsNullOrWhiteSpace(claimType) ? "—" : claimType)}\n" +
            $"• Policy: {(string.IsNullOrWhiteSpace(r.PolicyNumber) ? "—" : r.PolicyNumber)}\n" +
            $"• Reported: {r.CreatedAt:yyyy-MM-dd}\n" +
            $"• Status: Lodged — your case is on its way to our Claims Assessment team.\n\n" +
            "What happens next:\n" +
            "1. A claims assessor will review your details and policy cover within the next business day.\n" +
            "2. We'll be in touch if we need anything else from you — there's no need to chase us.\n" +
            "3. You can check progress any time in your Zava online portal.\n\n" +
            (isHigh
                ? "Because your situation is time-sensitive, we've flagged your case for priority handling and someone from our team will reach out personally.\n\n"
                : string.Empty) +
            "If anything changes or you have questions, just reply to this email or call us on the number on your policy.\n\n" +
            "Take care,\nCara\nCustomer Communications, Zava Insurance";

        var sms = isHigh
            ? $"Zava: {firstName}, claim {r.ClaimNumber} received and flagged for priority. We'll call you shortly. Reply STOP to opt out."
            : $"Zava: Hi {firstName}, your claim {r.ClaimNumber} has been received. We'll be in touch within 1 business day. Track it in the Zava app.";

        var portalHeading = $"Claim {r.ClaimNumber} — Lodged";
        var portalBody =
            $"Hi {firstName}, we've received your {(string.IsNullOrWhiteSpace(claimType) ? "claim" : claimType.ToLower() + " claim")} and it's now with our Claims Assessment team. " +
            "You don't need to do anything right now — we'll let you know as soon as the next step is ready. " +
            (isHigh
                ? "Your case has been marked as high priority."
                : "Most claims at this stage are picked up within one business day.");

        var summary =
            $"{r.CustomerName}'s {(string.IsNullOrWhiteSpace(claimType) ? "claim" : claimType.ToLower())} claim ({r.ClaimNumber}) has been lodged " +
            $"and is awaiting Claims Assessment. Urgency: {(string.IsNullOrWhiteSpace(urgency) ? "Unspecified" : urgency)}.";

        var nextSteps = new List<string>
        {
            "Claims Assessment confirms policy cover and reviews evidence.",
            "Customer is kept informed at each stage via their preferred channel" +
                (string.IsNullOrWhiteSpace(r.PreferredContact) ? "." : $" ({r.PreferredContact})."),
            isHigh
                ? "Priority handling: a human team member will call the customer today."
                : "No customer action required unless we ask for more information."
        };

        return new DraftBundle(
            Email: new EmailDraft(emailSubject, emailBody),
            Sms: sms,
            Portal: new PortalDraft(portalHeading, portalBody),
            Summary: summary,
            NextSteps: nextSteps,
            VulnerabilityFlags: flags,
            HumanApprovalRequired: humanApprovalRequired,
            HumanApprovalReason: humanApprovalReason);
    }

    private static string FirstName(string fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return "there";
        var first = fullName.Trim().Split(' ', 2)[0];
        return string.IsNullOrWhiteSpace(first) ? "there" : first;
    }
}
