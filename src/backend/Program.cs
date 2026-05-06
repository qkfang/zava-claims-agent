using System.Text.Json;
using Azure.AI.Projects;
using OpenAI.Responses;
using ZavaClaims.Agents;
using ZavaClaims.App.Api;
using ZavaClaims.App.Components;
using ZavaClaims.App.Mcp;
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
    AppMcpUrl = builder.Configuration["APP_MCP_URL"] ?? "http://localhost:5000",
};
builder.Services.AddSingleton(agentOptions);
builder.Services.AddSingleton<ClaimsAgentFactory>();

// HttpClient factory for MCP tools (e.g. fetching quote documents from URLs).
builder.Services.AddHttpClient();

// MCP server for the in-process tool surface used by Foundry agents.
// Always registered:
//   - LossAdjusterMcpTools (analyzeQuote / compareQuotes / generateClaimExcel)
//   - SupplierMcpTools (lookupSuppliers / generateQuoteRequestPdf)
//   - SettlementMcpTools (settlement_* payment-flow tools — payee validation,
//     invoice match, authority check, calculation, Teams approval request,
//     and gated release)
// The notice intelligence flow conditionally adds AgentDiMcpTools below when
// its Azure resources are configured.
var mcpBuilder = builder.Services.AddMcpServer()
    .WithHttpTransport(options => { options.Stateless = true; })
    .WithTools<LossAdjusterMcpTools>()
    .WithTools<ZavaClaims.App.Mcp.SupplierMcpTools>()
    .WithTools<SettlementMcpTools>();
builder.Services.AddCors();

// In-memory store of claim cases minted by the Claims Intake demo's
// "Try It Out" tab. Lets later agents in the demo flow look the case up
// by claim number.
builder.Services.AddSingleton<IntakeClaimStore>();
builder.Services.AddSingleton<TeamLeaderGroupChatService>();

// Settlement payment-flow services (always registered). The Settlement
// MCP tools and the /settlement/* HTTP endpoints depend on these.
// TeamsNotificationService degrades gracefully when TEAMS_WEBHOOK_URL is
// not configured (logs the payload instead of posting).
builder.Services.AddSingleton<PaymentApprovalStore>();
builder.Services.AddSingleton<TeamsNotificationService>();

// Fraud Investigation document-authenticity demo: loads the static sample
// manifest from wwwroot/fraud/samples/manifest.json and tracks per-claim
// case-document attachments. Always registered — falls back to manifest
// expectations when Content Understanding isn't configured.
builder.Services.AddSingleton<FraudCaseDocumentStore>();
builder.Services.AddSingleton<FraudDocumentVerifier>(sp => new FraudDocumentVerifier(
    sp.GetRequiredService<FraudCaseDocumentStore>(),
    sp.GetRequiredService<IConfiguration>(),
    sp.GetRequiredService<ILogger<FraudDocumentVerifier>>(),
    sp.GetService<ContentUnderstandingService>()));

// Quote-request PDF generator used by both the deterministic
// /supplier/process flow and the SupplierMcpTools MCP tool surface so the
// Supplier Coordinator agent can produce a downloadable PDF for the demo.
builder.Services.AddSingleton<QuoteRequestPdfService>();

// ── Notice intelligence integration (ported from demo-foundry-document-intelligence/agentdi)
// Only enabled when the required Azure resources are configured. When enabled,
// it exposes the four agentdi agents (Extract DI/CU, Notification, Correspondence)
// over /notice/* HTTP endpoints, an MCP tool surface at /mcp, and the static
// scenario pages under wwwroot/notice/.
var docIntelligenceEndpoint = builder.Configuration["AZURE_DOC_INTELLIGENCE_ENDPOINT"];
var storageAccountName = builder.Configuration["AZURE_STORAGE_ACCOUNT_NAME"];
var noticeEnabled = !string.IsNullOrWhiteSpace(agentOptions.ProjectEndpoint)
    && !string.IsNullOrWhiteSpace(agentOptions.ModelDeploymentName)
    && !string.IsNullOrWhiteSpace(docIntelligenceEndpoint)
    && !string.IsNullOrWhiteSpace(storageAccountName);

Azure.Identity.DefaultAzureCredential? noticeCredential = null;
if (noticeEnabled)
{
    var foundryEndpoint = builder.Configuration["AZURE_AI_FOUNDRY_ENDPOINT"]
        ?? new Uri(agentOptions.ProjectEndpoint!).GetLeftPart(UriPartial.Authority);

    noticeCredential = new Azure.Identity.DefaultAzureCredential(new Azure.Identity.DefaultAzureCredentialOptions
    {
        TenantId = agentOptions.TenantId,
        ExcludeVisualStudioCodeCredential = true,
        ExcludeSharedTokenCacheCredential = true
    });

    builder.Services.AddSingleton(sp => new DocIntelligenceService(
        docIntelligenceEndpoint!, noticeCredential, sp.GetRequiredService<ILogger<DocIntelligenceService>>()));
    builder.Services.AddSingleton(sp => new BlobStorageService(
        storageAccountName!, noticeCredential, sp.GetRequiredService<ILogger<BlobStorageService>>()));

    var cuGpt41Deployment = builder.Configuration["AZURE_CU_GPT41_DEPLOYMENT"] ?? "gpt-4.1";
    var cuGpt41MiniDeployment = builder.Configuration["AZURE_CU_GPT41_MINI_DEPLOYMENT"] ?? "gpt-4.1-mini";
    var cuEmbeddingDeployment = builder.Configuration["AZURE_CU_EMBEDDING_DEPLOYMENT"] ?? "text-embedding-3-large";
    builder.Services.AddSingleton(sp => new ContentUnderstandingService(
        foundryEndpoint, noticeCredential, cuGpt41Deployment, cuGpt41MiniDeployment, cuEmbeddingDeployment,
        sp.GetRequiredService<ILogger<ContentUnderstandingService>>()));

    builder.Services.AddSingleton<NotificationService>();
    builder.Services.AddSingleton<PendingApprovalStore>();

    mcpBuilder.WithTools<AgentDiMcpTools>();
}

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseAntiforgery();

// CORS + MCP Accept-header normalisation are always enabled because the MCP
// server is always registered (loss-adjuster + supplier tools). Notice
// intelligence optionally adds more tools to the same server below.
app.UseCors(policy => policy
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader());

// Normalize Accept header for MCP requests so Foundry agent / browser
// clients negotiate against the streaming + JSON content type the
// ModelContextProtocol server expects.
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/mcp"))
    {
        var accept = context.Request.Headers.Accept.ToString();
        if (string.IsNullOrEmpty(accept) || !accept.Contains("text/event-stream"))
        {
            context.Request.Headers.Accept = "application/json, text/event-stream";
        }
    }
    await next();
});

// MCP server is registered unconditionally so SupplierMcpTools and
// LossAdjusterMcpTools are always available; AgentDi tools join the same
// /mcp endpoint when noticeEnabled.
app.MapMcp("/mcp");

// In Development, force browsers to never cache static assets, Razor pages,
// or any other response from http://localhost:5212/. This prevents stale JS
// / HTML / CSS from being served while iterating on the demo locally.
if (app.Environment.IsDevelopment())
{
    app.Use(async (context, next) =>
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
            headers["Pragma"] = "no-cache";
            headers["Expires"] = "0";
            return Task.CompletedTask;
        });
        await next();
    });
}

// Serve dynamically-generated loss-adjuster output files (Excel workbooks
// produced by the generateClaimExcel MCP tool) from wwwroot/loss-adjuster/output/.
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.Context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            var headers = ctx.Context.Response.Headers;
            headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
            headers["Pragma"] = "no-cache";
            headers["Expires"] = "0";
        }
    }
});

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

// Enable WebSocket support for the Voice Live proxy that powers the
// Customer Communications agent's voice chat tab.
app.UseWebSockets();

// ── Markdown rendering endpoint (used by per-agent pages to format agent output) ──
app.MapMarkdownEndpoints();

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

// ── Claims Intake demo endpoints (Try It Out tab on /agents/claims-intake) ──
{
    var intakeLogger = app.Services.GetRequiredService<ILogger<Program>>();
    var intakeStore = app.Services.GetRequiredService<IntakeClaimStore>();
    var intakeFactory = app.Services.GetRequiredService<ClaimsAgentFactory>();

    // Pre-populate the in-memory claim store with one record per persona in
    // IntakeSampleCatalog so every "Try It Out" demo page has claims to pick
    // from straight away, without first lodging one in Claims Intake.
    intakeStore.SeedDefaults();

    app.MapIntakeEndpoints(intakeStore, intakeFactory, intakeLogger);
    app.MapLossAdjusterEndpoints(intakeStore, intakeFactory, intakeLogger);
    app.MapTeamLeaderEndpoints(intakeStore, intakeFactory, intakeLogger);

    var groupChatService = app.Services.GetRequiredService<TeamLeaderGroupChatService>();
    app.MapTeamLeaderGroupChatEndpoints(groupChatService, intakeLogger);
}

// ── MCP server endpoint (always on; loss-adjuster MCP tools live here, and
//    the optional notice intelligence flow adds AgentDiMcpTools alongside) ─
app.MapMcp("/mcp");

// ── Loss Adjuster output download endpoint ──
//    Streams .xlsx files written by the generateClaimExcel MCP tool.
app.MapGet("/loss-adjuster/download/{fileName}", (string fileName, IWebHostEnvironment env) =>
{
    if (string.IsNullOrWhiteSpace(fileName) ||
        fileName.Contains("..") ||
        fileName.Contains('/') ||
        fileName.Contains('\\'))
    {
        return Results.BadRequest(new { error = "Invalid file name." });
    }

    var dir = Path.Combine(env.WebRootPath ?? "wwwroot", "loss-adjuster", "output");
    var path = Path.Combine(dir, fileName);
    var fullDir = Path.GetFullPath(dir);
    var fullPath = Path.GetFullPath(path);
    if (!fullPath.StartsWith(fullDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
        !fullPath.Equals(fullDir, StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { error = "Invalid file path." });
    }
    if (!File.Exists(fullPath)) return Results.NotFound();

    return Results.File(
        fullPath,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName);
});

// ── Claims Assessment demo endpoints (Try It Out tab on /agents/claims-assessment) ──
{
    var assessmentLogger = app.Services.GetRequiredService<ILogger<Program>>();
    var assessmentStore = app.Services.GetRequiredService<IntakeClaimStore>();
    var assessmentFactory = app.Services.GetRequiredService<ClaimsAgentFactory>();
    app.MapAssessmentEndpoints(assessmentStore, assessmentFactory, assessmentLogger);
}

// ── Settlement demo endpoints (Try It Out tab on /agents/settlement) ────────
{
    var settlementLogger = app.Services.GetRequiredService<ILogger<Program>>();
    var settlementStore = app.Services.GetRequiredService<IntakeClaimStore>();
    var settlementFactory = app.Services.GetRequiredService<ClaimsAgentFactory>();
    app.MapSettlementEndpoints(settlementStore, settlementFactory, settlementLogger);
}

// ── Fraud Investigation demo endpoints (Try It Out tab on /agents/fraud-investigation) ──
{
    var fraudLogger = app.Services.GetRequiredService<ILogger<Program>>();
    var intakeStore = app.Services.GetRequiredService<IntakeClaimStore>();
    var fraudFactory = app.Services.GetRequiredService<ClaimsAgentFactory>();
    var fraudDocStore = app.Services.GetRequiredService<FraudCaseDocumentStore>();
    var fraudVerifier = app.Services.GetRequiredService<FraudDocumentVerifier>();
    app.MapFraudEndpoints(intakeStore, fraudFactory, fraudDocStore, fraudVerifier, fraudLogger);
}

// ── Customer Communications demo endpoints (Try It Out tab on
//    /agents/customer-communications) ────────────────────────────────────────
{
    var commsLogger = app.Services.GetRequiredService<ILogger<Program>>();
    var intakeStore = app.Services.GetRequiredService<IntakeClaimStore>();
    var commsFactory = app.Services.GetRequiredService<ClaimsAgentFactory>();
    app.MapCommunicationsEndpoints(intakeStore, commsFactory, commsLogger);

    // Voice Live (real-time speech-to-speech) proxy + config for the
    // Customer Communications voice chat tab.
    var commsLoggerFactory = app.Services.GetRequiredService<ILoggerFactory>();
    app.MapCommunicationsVoiceLiveEndpoints(agentOptions, commsFactory, commsLoggerFactory);
}

// ── Supplier Coordination demo endpoints (Try It Out tab on
//    /agents/supplier-coordinator) ─────────────────────────────────────────
{
    var supplierLogger = app.Services.GetRequiredService<ILogger<Program>>();
    var supplierStore = app.Services.GetRequiredService<IntakeClaimStore>();
    var supplierFactory = app.Services.GetRequiredService<ClaimsAgentFactory>();
    app.MapSupplierEndpoints(supplierStore, supplierFactory, supplierLogger);
}

// ── Agent metadata (powers the "Agent Prompt & Tools" sub-tab on every
//    agent page; static + does not require Foundry to be configured). ──
{
    var metadataOptions = app.Services.GetRequiredService<ClaimsAgentOptions>();
    app.MapAgentMetadataEndpoints(metadataOptions);
}

// ── Notice intelligence endpoints (agentdi port) ─────────────────────────────
if (noticeEnabled)
{
    var noticeLogger = app.Services.GetRequiredService<ILogger<Program>>();
    var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();

    var aiProjectClient = new AIProjectClient(new Uri(agentOptions.ProjectEndpoint!), noticeCredential!);
    var appMcpUrl = app.Configuration["APP_MCP_URL"] ?? "http://localhost:5000";
    var appMcpTool = ResponseTool.CreateMcpTool(
        serverLabel: "agentdi-mcp",
        serverUri: new Uri($"{appMcpUrl}/mcp"),
        toolCallApprovalPolicy: new McpToolCallApprovalPolicy(GlobalMcpToolCallApprovalPolicy.NeverRequireApproval));
    var appMcpToolWithApproval = ResponseTool.CreateMcpTool(
        serverLabel: "agentdi-mcp",
        serverUri: new Uri($"{appMcpUrl}/mcp"),
        toolCallApprovalPolicy: new McpToolCallApprovalPolicy(GlobalMcpToolCallApprovalPolicy.AlwaysRequireApproval));

    var deployment = agentOptions.ModelDeploymentName!;
    var notificationAgent = new CtAgNotification(aiProjectClient, deployment, [appMcpTool], loggerFactory.CreateLogger<CtAgNotification>());
    var correspondenceAgent = new CtAgCorrespondence(aiProjectClient, deployment, [appMcpToolWithApproval], loggerFactory.CreateLogger<CtAgCorrespondence>());
    var extractDiAgent = new CtAgExtractDI(aiProjectClient, deployment, [appMcpTool], loggerFactory.CreateLogger<CtAgExtractDI>());
    var extractCuAgent = new CtAgExtractCU(aiProjectClient, deployment, loggerFactory.CreateLogger<CtAgExtractCU>());

    var docService = app.Services.GetRequiredService<DocIntelligenceService>();
    var cuService = app.Services.GetRequiredService<ContentUnderstandingService>();
    await cuService.InitializeAsync();
    var blobStorage = app.Services.GetRequiredService<BlobStorageService>();
    var notificationService = app.Services.GetRequiredService<NotificationService>();
    var approvalStore = app.Services.GetRequiredService<PendingApprovalStore>();

    app.MapNoticeEndpoints(notificationAgent, correspondenceAgent, extractDiAgent, extractCuAgent,
        docService, cuService, blobStorage, notificationService, approvalStore, noticeLogger);
}

app.Run();
