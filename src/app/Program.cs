using ZavaClaims.App.Components;
using ZavaClaims.App.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

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

app.Run();
