using System.Text.Json;
using Azure;
using Azure.AI.DocumentIntelligence;
using Azure.Core;
using Microsoft.Extensions.Logging;

namespace ZavaClaims.App.Services;

public record DocIntelligenceResult(string Markdown, string Json);

public class DocIntelligenceService
{
    private readonly DocumentIntelligenceClient _client;
    private readonly ILogger<DocIntelligenceService> _logger;

    public DocIntelligenceService(string endpoint, TokenCredential credential, ILogger<DocIntelligenceService> logger)
    {
        _client = new DocumentIntelligenceClient(new Uri(endpoint), credential);
        _logger = logger;
    }

    public async Task<DocIntelligenceResult> AnalyzeFromUrlAsync(Uri documentUrl)
    {
        _logger.LogInformation("Analyzing document from URL: {Url}", Sanitize(documentUrl.ToString()));
        var options = new AnalyzeDocumentOptions("prebuilt-layout", documentUrl)
        {
            OutputContentFormat = DocumentContentFormat.Markdown
        };
        var operation = await _client.AnalyzeDocumentAsync(WaitUntil.Completed, options);
        return BuildResult(operation);
    }

    public async Task<DocIntelligenceResult> AnalyzeFromBytesAsync(BinaryData content)
    {
        _logger.LogInformation("Analyzing document from {Bytes} bytes", content.ToMemory().Length);
        var options = new AnalyzeDocumentOptions("prebuilt-layout", content)
        {
            OutputContentFormat = DocumentContentFormat.Markdown
        };
        var operation = await _client.AnalyzeDocumentAsync(WaitUntil.Completed, options);
        return BuildResult(operation);
    }

    private static DocIntelligenceResult BuildResult(Operation<AnalyzeResult> operation)
    {
        var markdown = operation.Value.Content ?? string.Empty;
        var rawJson = operation.GetRawResponse().Content.ToString();
        return new DocIntelligenceResult(markdown, PrettyJson(rawJson));
    }

    private static string PrettyJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return JsonSerializer.Serialize(doc.RootElement, new JsonSerializerOptions { WriteIndented = true });
        }
        catch
        {
            return json;
        }
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}
