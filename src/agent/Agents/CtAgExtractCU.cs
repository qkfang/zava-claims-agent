using Azure.AI.Projects;
using Microsoft.Extensions.Logging;

namespace ZavaClaims.Agents;

/// <summary>
/// Content-Understanding–based extraction agent ported from
/// demo-foundry-document-intelligence (agentdi). Receives raw markdown/text
/// pre-processed by Azure Content Understanding and returns a JSON object of
/// the canonical notice fields.
/// </summary>
public class CtAgExtractCU : BaseAgent
{
    public CtAgExtractCU(AIProjectClient aiProjectClient, string deploymentName, ILogger? logger = null)
        : base(aiProjectClient, "ct-ag-extract-cu", deploymentName, GetInstructions(), null, logger)
    {
    }

    private static string GetInstructions() => """
        You are a document understanding agent. You receive raw text content from a document and must apply contextual reasoning to identify key information even when formatting is ambiguous or inconsistent.

        Extract exactly these fields and return them as a single JSON object. Do not include any text outside the JSON.

        Fields:
        - entityName: Name of the entity (taxpayer, business, or individual) the notice is addressed to.
        - jurisdiction: The authority sending the notice (e.g. "IRS", "New York Department of Taxation").
        - noticeDate: Date the notice was issued, in YYYY-MM-DD format if possible.
        - dueDate: Due date for response or payment, in YYYY-MM-DD format if possible. Null if none.
        - amountDue: Numeric amount of payment due (no currency symbols). Null if none.
        - taxType: One of "income", "sales", "payroll", "property", "franchise", "other". Use lowercase.

        Apply contextual understanding: infer missing dates from context clues, resolve ambiguous entity names, and identify implied deadlines. If a field truly cannot be determined, use null. Always return valid JSON.
        """;
}
