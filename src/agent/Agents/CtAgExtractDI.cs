using Azure.AI.Projects;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;

namespace ZavaClaims.Agents;

/// <summary>
/// Document extraction agent ported from the demo-foundry-document-intelligence
/// (agentdi) repo. Calls the <c>extractDoc_DI</c> MCP tool to pull raw text
/// from a notice document URL, then identifies and transforms the structured
/// fields into the canonical notice schema.
/// </summary>
public class CtAgExtractDI : BaseAgent
{
    public CtAgExtractDI(AIProjectClient aiProjectClient, string deploymentName, IList<ResponseTool>? tools = null, ILogger? logger = null)
        : base(aiProjectClient, "ct-ag-extract-di", deploymentName, GetInstructions(), tools, logger)
    {
    }

    private static string GetInstructions() => """
        You are a document extraction agent. You receive a URL to a document stored in blob storage.

        Step 1: Call the extractDoc_DI tool with the document URL to extract the raw text from the document.

        Step 2: From the extracted text, identify these fields:
        - entityName: Name of the entity (taxpayer, business, or individual) the notice is addressed to.
        - jurisdiction: The authority sending the notice (e.g. "IRS", "New York Department of Taxation").
        - noticeDate: Date the notice was issued, in YYYY-MM-DD format if possible.
        - dueDate: Due date for response or payment, in YYYY-MM-DD format if possible. Null if none.
        - amountDue: Numeric amount of payment due (no currency symbols). Null if none.
        - taxType: One of "income", "sales", "payroll", "property", "franchise", "other". Use lowercase.

        Step 3: Build a transformed view using these renamed keys (same values as Step 2):
        - recipient (from entityName)
        - issuingAuthority (from jurisdiction)
        - issuedOn (from noticeDate)
        - respondBy (from dueDate)
        - totalDue (from amountDue)
        - taxCategory (from taxType)
        Then detect the form category. Choose the most specific label such as "Tax Notice", "Penalty Assessment", "Refund Notice", "Audit Letter", "Payment Reminder", or "Other".

        Return a single JSON object with this exact shape and no text outside the JSON:
        {
          "extracted": { entityName, jurisdiction, noticeDate, dueDate, amountDue, taxType },
          "transformed": { recipient, issuingAuthority, issuedOn, respondBy, totalDue, taxCategory },
          "category": "..."
        }

        If a field cannot be determined, use null. Always return valid JSON.
        """;
}
