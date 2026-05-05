using System.ComponentModel;
using ZavaClaims.App.Services;
using ModelContextProtocol.Server;

namespace ZavaClaims.App.Mcp;

[McpServerToolType]
public class AgentDiMcpTools
{
    private readonly DocIntelligenceService _docIntelligence;
    private readonly ContentUnderstandingService _contentUnderstanding;
    private readonly NotificationService _notification;

    public AgentDiMcpTools(
        DocIntelligenceService docIntelligence,
        ContentUnderstandingService contentUnderstanding,
        NotificationService notification)
    {
        _docIntelligence = docIntelligence;
        _contentUnderstanding = contentUnderstanding;
        _notification = notification;
    }

    [McpServerTool(Name = "extractDoc_DI"),
     Description("Use Azure AI Document Intelligence (prebuilt-layout) to extract fields and information from a document URL.")]
    public async Task<string> ExtractDocDI(
        [Description("Public URL of the document to analyze")] string documentUrl)
    {
        if (string.IsNullOrWhiteSpace(documentUrl))
            return "Error: documentUrl is required.";

        if (!Uri.TryCreate(documentUrl, UriKind.Absolute, out var uri))
            return "Error: documentUrl is not a valid URL.";

        var result = await _docIntelligence.AnalyzeFromUrlAsync(uri);
        return result.Markdown;
    }

    [McpServerTool(Name = "extractDoc_CU"),
     Description("Use Azure AI Content Understanding to extract fields and information from a document URL.")]
    public async Task<string> ExtractDocCU(
        [Description("Public URL of the document to analyze")] string documentUrl,
        [Description("Content Understanding analyzer id (e.g. prebuilt-documentSearch, prebuilt-invoice, prebuilt-receipt). Defaults to prebuilt-documentSearch.")]
        string analyzerId = "prebuilt-documentSearch")
    {
        if (string.IsNullOrWhiteSpace(documentUrl))
            return "Error: documentUrl is required.";

        if (!Uri.TryCreate(documentUrl, UriKind.Absolute, out var uri))
            return "Error: documentUrl is not a valid URL.";

        var result = await _contentUnderstanding.AnalyzeFromUrlAsync(uri, analyzerId);
        return result.Markdown;
    }

    [McpServerTool(Name = "notification"),
     Description("Send a notification email to a recipient.")]
    public async Task<string> Notification(
        [Description("Recipient email address")] string to,
        [Description("Email subject")] string subject,
        [Description("Email body")] string body)
    {
        if (string.IsNullOrWhiteSpace(to) || string.IsNullOrWhiteSpace(subject))
            return "Error: 'to' and 'subject' are required.";

        return await _notification.SendEmailAsync(to, subject, body ?? string.Empty);
    }
}
