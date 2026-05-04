using System.Text.Json;
using ZavaClaims.App.Components;
using ZavaClaims.App.Models;
using ZavaClaims.App.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Chat services (ported from forex-trading-agent/src/research-analytics).
builder.Services.AddHttpClient<ChatService>();
builder.Services.AddSingleton<ChatKitStore>();

// Bind claims-agent configuration (Foundry endpoint, model deployment, search /
// Bing connections) and register a singleton factory that the Blazor app uses
// to invoke agents from the referenced `agent` library — the same agents the
// CLI host in `src/agent` exposes.
var agentOptions = new ClaimsAgentOptions
{
    ProjectEndpoint = builder.Configuration["AZURE_AI_PROJECT_ENDPOINT"],
    ModelDeploymentName = builder.Configuration["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
    TenantId = builder.Configuration["AZURE_TENANT_ID"],
    SearchConnectionId = builder.Configuration["AZURE_AI_SEARCH_CONNECTION_ID"],
    SearchIndexName = builder.Configuration["AZURE_AI_SEARCH_INDEX_NAME"],
    BingConnectionId = builder.Configuration["AZURE_BING_CONNECTION_ID"],
};
builder.Services.AddSingleton(agentOptions);
builder.Services.AddSingleton<ClaimsAgentFactory>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

// ── Floating-chatbot endpoint (ChatKit SSE protocol) ─────────────────────────
app.MapPost("/chatkit", (HttpContext ctx, ChatKitStore store, ChatService chatService) =>
    ChatKitHandler.HandleAsync(ctx, store, chatService));

// ── Document-query chatbot endpoint (advanced chat with references) ──────────
app.MapPost("/api/chat/ask", async (HttpContext ctx, ChatService chatService) =>
{
    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync();
    using var doc = JsonDocument.Parse(body);
    var root = doc.RootElement;

    var message = root.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
    var temperature = root.TryGetProperty("temperature", out var t) ? t.GetDouble() : 0.7;

    var agentResponse = await chatService.SendMessageWithOptionsAsync(message, temperature);

    // Build references: surface relevant Zava claims agents from the AgentCatalog
    // based on simple keyword matching against the user's question. Mirrors the
    // article-reference behaviour of the source repo's /api/chat/ask endpoint.
    var keywords = (message ?? string.Empty).ToLowerInvariant()
        .Split(' ', StringSplitOptions.RemoveEmptyEntries)
        .Where(w => w.Length > 3)
        .ToHashSet();

    var references = AgentCatalog.All
        .Select(a => new
        {
            Agent = a,
            Searchable = ($"{a.Name} {a.Department} {a.Tagline} {a.Purpose} " +
                          string.Join(" ", a.Responsibilities)).ToLowerInvariant()
        })
        .Where(x => keywords.Count == 0 || keywords.Any(k => x.Searchable.Contains(k)))
        .Take(5)
        .Select(x => new
        {
            Id = x.Agent.Id,
            Title = x.Agent.Name,
            Summary = x.Agent.Tagline,
            Category = x.Agent.Department,
            Sentiment = "Neutral",
            Author = x.Agent.Persona,
            PublishedDate = "Zava claims office",
            Url = $"/agents/{x.Agent.Id}"
        })
        .ToList();

    return Results.Ok(new { response = agentResponse, references });
});

app.Run();
