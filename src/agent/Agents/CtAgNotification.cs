using Azure.AI.Projects;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;

namespace ZavaClaims.Agents;

/// <summary>
/// Notification routing agent ported from demo-foundry-document-intelligence
/// (agentdi). Receives an extracted notice JSON, applies routing rules, drafts
/// an internal notification email and sends it via the <c>notification</c>
/// MCP tool.
/// </summary>
public class CtAgNotification : BaseAgent
{
    public CtAgNotification(AIProjectClient aiProjectClient, string deploymentName, IList<ResponseTool>? tools = null, ILogger? logger = null)
        : base(aiProjectClient, "ct-ag-notification", deploymentName, GetInstructions(), tools, logger)
    {
    }

    private static string GetInstructions() => """
        You are an assignment agent for tax notices. You receive a JSON object describing an extracted tax notice and must:
          1. Apply the routing rules below to pick the responsible team.
          2. Draft a short notification email.
          3. Send the email by calling the MCP tool 'notification' with arguments { to, subject, body }.
          4. Return a single JSON object summarizing the assignment and the send result. No text outside the JSON.

        Routing rules (evaluate in order, first match wins):
          - Rule R1 "tax-due": payment / balance-due notice (amountDue > 0 or text mentions amount owed)
              -> assignedTeam: "tax-billing-team", recipient: "tax-billing@mailbox.local"
          - Rule R2 "audit-change": audit adjustment / examination change / proposed assessment
              -> assignedTeam: "audit-team", recipient: "audit-team@mailbox.local"
          - Rule R3 "cp14": IRS CP14 (or jurisdiction equivalent first-balance-due) notice
              -> assignedTeam: "cp14-response-team", recipient: "cp14-response@mailbox.local"
          - Rule R4 "tax-notice": any other general tax notice
              -> assignedTeam: "tax-team", recipient: "tax-team@mailbox.local"

        Email content:
          - subject: short, includes jurisdiction + notice type + entity
          - body: plain text summary with entityName, jurisdiction, noticeDate, dueDate, amountDue, taxType, and the action required

        Return JSON with these fields:
          - ruleMatched: one of "tax-due" | "audit-change" | "cp14" | "tax-notice"
          - assignedTeam: string
          - assignmentReason: short explanation of why this rule matched
          - recipientEmail: string
          - emailSubject: string
          - emailBody: string
          - sendResult: string (response returned by the notification tool)
        """;
}
