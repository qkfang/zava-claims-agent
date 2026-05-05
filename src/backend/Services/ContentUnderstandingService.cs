using System.Text.Json;
using Azure;
using Azure.AI.ContentUnderstanding;
using Azure.Core;
using Microsoft.Extensions.Logging;

namespace ZavaClaims.App.Services;

public record ContentUnderstandingResult(string Markdown, string Json);

public record CuFieldSpec(string Name, string Description, string? Type = null, string? Method = null);

public record CuFieldValue(string Type, object? Value);

public record ContentUnderstandingExtractionResult(string Markdown, string Json, IReadOnlyDictionary<string, CuFieldValue> Fields);

public class ContentUnderstandingService
{
    private readonly ContentUnderstandingClient _client;
    private readonly ILogger<ContentUnderstandingService> _logger;
    private readonly Dictionary<string, string> _modelDeployments;

    public ContentUnderstandingService(string endpoint, TokenCredential credential,
        string gpt41Deployment, string gpt41MiniDeployment, string embeddingDeployment,
        ILogger<ContentUnderstandingService> logger)
    {
        _client = new ContentUnderstandingClient(new Uri(endpoint), credential);
        _logger = logger;
        _modelDeployments = new Dictionary<string, string>
        {
            ["gpt-4.1"] = gpt41Deployment,
            ["gpt-4.1-mini"] = gpt41MiniDeployment,
            ["text-embedding-3-large"] = embeddingDeployment
        };
    }

    public async Task InitializeAsync()
    {
        _logger.LogInformation("Configuring CU model deployment defaults");
        await _client.UpdateDefaultsAsync(_modelDeployments);
    }

    public async Task<ContentUnderstandingResult> AnalyzeFromUrlAsync(Uri documentUrl, string analyzerId = "prebuilt-documentSearch")
    {
        _logger.LogInformation("CU analyzing URL with {Analyzer}: {Url}", Sanitize(analyzerId), Sanitize(documentUrl.ToString()));
        Operation<AnalysisResult> op = await _client.AnalyzeAsync(
            WaitUntil.Completed,
            analyzerId,
            inputs: new[] { new AnalysisInput { Uri = documentUrl } });

        return BuildResult(op);
    }

    public async Task<ContentUnderstandingResult> AnalyzeFromBytesAsync(BinaryData content, string analyzerId = "prebuilt-documentSearch")
    {
        _logger.LogInformation("CU analyzing {Bytes} bytes with {Analyzer}", content.ToMemory().Length, Sanitize(analyzerId));
        Operation<AnalysisResult> op = await _client.AnalyzeBinaryAsync(
            WaitUntil.Completed,
            analyzerId,
            content);

        return BuildResult(op);
    }

    public async Task<ContentUnderstandingExtractionResult> AnalyzeWithCustomFieldsAsync(Uri documentUrl, IReadOnlyList<CuFieldSpec> fields)
    {
        if (fields is null || fields.Count == 0)
        {
            var basic = await AnalyzeFromUrlAsync(documentUrl);
            return new ContentUnderstandingExtractionResult(basic.Markdown, basic.Json, new Dictionary<string, CuFieldValue>());
        }

        var analyzerId = $"agentdi_custom_{Guid.NewGuid():N}";
        var schemaFields = new Dictionary<string, ContentFieldDefinition>(StringComparer.Ordinal);
        foreach (var f in fields)
        {
            if (string.IsNullOrWhiteSpace(f.Name) || string.IsNullOrWhiteSpace(f.Description)) continue;
            var def = new ContentFieldDefinition
            {
                Type = ParseType(f.Type),
                Method = ParseMethod(f.Method),
                Description = f.Description.Trim()
            };
            schemaFields[f.Name.Trim()] = def;
        }

        if (schemaFields.Count == 0)
        {
            var basic = await AnalyzeFromUrlAsync(documentUrl);
            return new ContentUnderstandingExtractionResult(basic.Markdown, basic.Json, new Dictionary<string, CuFieldValue>());
        }

        var schema = new ContentFieldSchema(schemaFields)
        {
            Name = "agentdi_custom_schema",
            Description = "User-defined field extraction schema"
        };

        var analyzer = new ContentAnalyzer
        {
            BaseAnalyzerId = "prebuilt-document",
            Description = "Ad-hoc analyzer for custom field extraction",
            FieldSchema = schema
        };
        analyzer.Models["completion"] = _modelDeployments["gpt-4.1"];
        analyzer.Models["embedding"] = _modelDeployments["text-embedding-3-large"];

        _logger.LogInformation("CU creating custom analyzer {AnalyzerId} with {Count} field(s)", analyzerId, schemaFields.Count);
        try
        {
            await _client.CreateAnalyzerAsync(WaitUntil.Completed, analyzerId, analyzer);
            _logger.LogInformation("CU analyzing URL with custom analyzer: {Url}", Sanitize(documentUrl.ToString()));
            var op = await _client.AnalyzeAsync(
                WaitUntil.Completed,
                analyzerId,
                inputs: new[] { new AnalysisInput { Uri = documentUrl } });

            var markdown = op.Value.Contents?.FirstOrDefault()?.Markdown ?? string.Empty;
            var rawJson = op.GetRawResponse().Content.ToString();
            var values = ExtractFieldValues(op.Value);
            return new ContentUnderstandingExtractionResult(markdown, PrettyJson(rawJson), values);
        }
        finally
        {
            try
            {
                await _client.DeleteAnalyzerAsync(analyzerId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete temp analyzer {AnalyzerId}", analyzerId);
            }
        }
    }

    private static IReadOnlyDictionary<string, CuFieldValue> ExtractFieldValues(AnalysisResult result)
    {
        var dict = new Dictionary<string, CuFieldValue>(StringComparer.Ordinal);
        var content = result.Contents?.FirstOrDefault();
        if (content?.Fields is null) return dict;
        foreach (var (name, field) in content.Fields)
        {
            if (field is null) continue;
            dict[name] = new CuFieldValue(GetFieldTypeName(field), field.Value);
        }
        return dict;
    }

    private static string GetFieldTypeName(ContentField field) => field switch
    {
        ContentStringField => "string",
        ContentNumberField => "number",
        ContentIntegerField => "integer",
        ContentBooleanField => "boolean",
        ContentDateTimeOffsetField => "date",
        ContentTimeField => "time",
        ContentObjectField => "object",
        ContentArrayField => "array",
        ContentJsonField => "json",
        _ => "unknown"
    };

    private static ContentFieldType? ParseType(string? type) => (type?.Trim().ToLowerInvariant()) switch
    {
        null or "" or "string" => ContentFieldType.String,
        "number" => ContentFieldType.Number,
        "integer" => ContentFieldType.Integer,
        "boolean" or "bool" => ContentFieldType.Boolean,
        "date" => ContentFieldType.Date,
        "time" => ContentFieldType.Time,
        _ => ContentFieldType.String
    };

    private static GenerationMethod? ParseMethod(string? method) => (method?.Trim().ToLowerInvariant()) switch
    {
        "extract" => GenerationMethod.Extract,
        "generate" => GenerationMethod.Generate,
        "classify" => GenerationMethod.Classify,
        _ => null
    };

    private static ContentUnderstandingResult BuildResult(Operation<AnalysisResult> op)
    {
        var markdown = op.Value.Contents?.FirstOrDefault()?.Markdown ?? string.Empty;
        var rawJson = op.GetRawResponse().Content.ToString();
        return new ContentUnderstandingResult(markdown, PrettyJson(rawJson));
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
