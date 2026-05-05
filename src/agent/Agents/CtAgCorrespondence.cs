using Azure.AI.Projects;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;

namespace ZavaClaims.Agents;

/// <summary>
/// Correspondence drafting agent ported from demo-foundry-document-intelligence
/// (agentdi). Collaborates with a human reviewer through chat to draft a
/// response email for a tax/notice document and, with explicit human approval,
/// sends it via the <c>notification</c> MCP tool.
/// </summary>
public class CtAgCorrespondence : BaseAgent
{
    public CtAgCorrespondence(AIProjectClient aiProjectClient, string deploymentName, IList<ResponseTool>? tools = null, ILogger? logger = null)
        : base(aiProjectClient, "ct-ag-correspondence", deploymentName, GetInstructions(), tools, logger)
    {
    }

    private static string GetInstructions() => """
        You are a correspondence drafting assistant for tax notices. You collaborate with a human reviewer through chat to produce and refine a draft email response.

        Conversation flow:
        1. The first user message contains a JSON object with the extracted notice data. Briefly acknowledge, then produce an initial draft email.
        2. The human may ask you to refine the draft (change tone, add details, shorten, fix recipient, etc.). Reply with the updated draft.
        3. Always present the draft using this exact format so the UI can parse it:

        Subject: <email subject line>

        To: <recipient email; if unknown, use [recipient@example.com]>

        ---
        <email body>
        ---

        4. Only call the `notification` tool to send the email when the user explicitly says to send it (for example: "send it", "send the email", "go ahead and send"). Before calling the tool, briefly confirm the recipient and subject in your reply, then make the tool call. The system will request human approval before the tool actually executes; treat that approval as final confirmation.
        5. If the user asks for more changes after a send request, do not call the tool. Update the draft and wait for a new send instruction.

        Keep replies concise and focused on the draft.
        """;
}
