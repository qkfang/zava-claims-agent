using System.Text.Json;
using Markdig;

namespace ZavaClaims.App.Api;

/// <summary>
/// Renders Markdown to HTML server-side using Markdig. Used by the per-agent
/// pages to format agent narrative / drafted-letter / drafted-email output as
/// structured HTML instead of a flat &lt;pre&gt; block.
/// </summary>
public static class MarkdownApi
{
    // GFM-style pipeline with raw HTML disabled so agent text can't inject
    // arbitrary markup into the page.
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .UseSoftlineBreakAsHardlineBreak()
        .DisableHtml()
        .Build();

    public static void MapMarkdownEndpoints(this WebApplication app)
    {
        app.MapPost("/api/markdown", async (HttpContext ctx) =>
        {
            using var reader = new StreamReader(ctx.Request.Body);
            var body = await reader.ReadToEndAsync();
            string text = string.Empty;
            if (!string.IsNullOrWhiteSpace(body))
            {
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    if (doc.RootElement.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
                    {
                        text = t.GetString() ?? string.Empty;
                    }
                }
                catch (JsonException)
                {
                    // Allow plain-text bodies as a convenience.
                    text = body;
                }
            }

            var html = string.IsNullOrEmpty(text) ? string.Empty : Markdown.ToHtml(text, Pipeline);
            return Results.Ok(new { html });
        });
    }
}
