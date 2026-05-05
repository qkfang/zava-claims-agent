using ZavaClaims.Agents;
using ZavaClaims.App.Services;
using System.Text.Json;

namespace ZavaClaims.App.Api;

record NoticeUrlRequest(string Url);
record NoticeTextRequest(string Text);
record JsonRequest(string Json);
record ApproveRequest(string RunId, bool Approved);
record SendEmailRequest(string To, string Subject, string Body);
record CorrespondenceChatRequest(string PreviousResponseId, string Message);

public static class NoticeApi
{
    public static void MapNoticeEndpoints(this WebApplication app,
        CtAgNotification notificationAgent,
        CtAgCorrespondence correspondenceAgent,
        CtAgExtractDI extractDiAgent, CtAgExtractCU extractCuAgent,
        DocIntelligenceService docService, ContentUnderstandingService cuService,
        BlobStorageService blobStorage, NotificationService notificationService,
        PendingApprovalStore approvalStore, ILogger logger)
    {
        app.MapGet("/notice/agents/instructions", () =>
        {
            var agents = new BaseAgent[] { extractDiAgent, extractCuAgent, notificationAgent, correspondenceAgent };
            return Results.Ok(agents.ToDictionary(a => a.AgentId, a => a.Instructions));
        });

        app.MapPost("/notice/extract/di/upload", async (HttpRequest http) =>
        {
            if (!http.HasFormContentType)
                return Results.BadRequest(new { error = "multipart/form-data required" });

            var form = await http.ReadFormAsync();
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "file is required" });

            logger.LogInformation("Extract DI upload: {FileName} ({Size} bytes)", Sanitize(file.FileName), file.Length);
            using var stream = file.OpenReadStream();
            var blobUrl = await blobStorage.UploadAsync(stream, file.FileName);
            var result = await docService.AnalyzeFromUrlAsync(blobUrl);
            return Results.Ok(new { markdown = result.Markdown, json = result.Json });
        });

        app.MapPost("/notice/extract/cu/upload", async (HttpRequest http) =>
        {
            if (!http.HasFormContentType)
                return Results.BadRequest(new { error = "multipart/form-data required" });

            var form = await http.ReadFormAsync();
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "file is required" });

            var fieldsJson = form["fields"].ToString();
            List<CuFieldSpec> fieldSpecs = new();
            if (!string.IsNullOrWhiteSpace(fieldsJson))
            {
                try
                {
                    fieldSpecs = JsonSerializer.Deserialize<List<CuFieldSpec>>(fieldsJson,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();
                }
                catch (JsonException ex)
                {
                    return Results.BadRequest(new { error = $"invalid fields JSON: {ex.Message}" });
                }
            }

            logger.LogInformation("Extract CU upload: {FileName} ({Size} bytes), {FieldCount} custom field(s)",
                Sanitize(file.FileName), file.Length, fieldSpecs.Count);
            using var stream = file.OpenReadStream();
            var blobUrl = await blobStorage.UploadAsync(stream, file.FileName);

            if (fieldSpecs.Count == 0)
            {
                var result = await cuService.AnalyzeFromUrlAsync(blobUrl);
                return Results.Ok(new { markdown = result.Markdown, json = result.Json, fields = new Dictionary<string, CuFieldValue>() });
            }

            var extraction = await cuService.AnalyzeWithCustomFieldsAsync(blobUrl, fieldSpecs);
            return Results.Ok(new { markdown = extraction.Markdown, json = extraction.Json, fields = extraction.Fields });
        });

        app.MapPost("/notice/extract/agent/upload", async (HttpRequest http) =>
        {
            if (!http.HasFormContentType)
                return Results.BadRequest(new { error = "multipart/form-data required" });

            var form = await http.ReadFormAsync();
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "file is required" });

            logger.LogInformation("Extract Agent upload: {FileName} ({Size} bytes)", Sanitize(file.FileName), file.Length);
            using var stream = file.OpenReadStream();
            var blobUrl = await blobStorage.UploadAsync(stream, file.FileName);
            var response = (await extractDiAgent.RunAsync(blobUrl.ToString())).Text;
            return Results.Ok(new { response });
        });

        app.MapPost("/notice/notification/upload", async (HttpRequest http) =>
        {
            if (!http.HasFormContentType)
                return Results.BadRequest(new { error = "multipart/form-data required" });

            var form = await http.ReadFormAsync();
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "file is required" });

            logger.LogInformation("Notification upload: {FileName} ({Size} bytes)", Sanitize(file.FileName), file.Length);
            using var stream = file.OpenReadStream();
            var blobUrl = await blobStorage.UploadAsync(stream, file.FileName);
            var cuResult = await cuService.AnalyzeFromUrlAsync(blobUrl);
            var response = (await extractCuAgent.RunAsync(cuResult.Markdown)).Text;
            return Results.Ok(new { markdown = cuResult.Markdown, json = cuResult.Json, response });
        });

        app.MapPost("/notice/notification/assign", async (JsonRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.Json))
                return Results.BadRequest(new { error = "json is required" });

            logger.LogInformation("Notification assign request ({Length} chars)", request.Json.Length);
            var response = (await notificationAgent.RunAsync(request.Json)).Text;
            return Results.Ok(new { response });
        });

        app.MapPost("/notice/correspondence/upload", async (HttpRequest http) =>
        {
            if (!http.HasFormContentType)
                return Results.BadRequest(new { error = "multipart/form-data required" });

            var form = await http.ReadFormAsync();
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
                return Results.BadRequest(new { error = "file is required" });

            logger.LogInformation("Correspondence upload: {FileName} ({Size} bytes)", Sanitize(file.FileName), file.Length);
            using var stream = file.OpenReadStream();
            var blobUrl = await blobStorage.UploadAsync(stream, file.FileName);
            var cuResult = await cuService.AnalyzeFromUrlAsync(blobUrl);
            var extracted = (await extractCuAgent.RunAsync(cuResult.Markdown)).Text;

            var step = await correspondenceAgent.StartRunAsync(extracted);
            return BuildCorrespondenceResponse(step, approvalStore, extracted);
        });

        app.MapPost("/notice/correspondence/chat", async (CorrespondenceChatRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.PreviousResponseId) || string.IsNullOrWhiteSpace(request.Message))
                return Results.BadRequest(new { error = "previousResponseId and message are required" });

            logger.LogInformation("Correspondence chat ({Length} chars)", request.Message.Length);
            var step = await correspondenceAgent.ChatAsync(request.PreviousResponseId, request.Message);
            return BuildCorrespondenceResponse(step, approvalStore, null);
        });

        app.MapPost("/notice/correspondence/approve", async (ApproveRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.RunId))
                return Results.BadRequest(new { error = "runId is required" });

            var state = approvalStore.Get(request.RunId);
            if (state is null)
                return Results.NotFound(new { error = "run not found or already completed" });

            approvalStore.Remove(request.RunId);
            logger.LogInformation("Correspondence approval: runId={RunId} approved={Approved}", Sanitize(request.RunId), request.Approved);

            var step = await correspondenceAgent.ContinueRunAsync(state.PreviousResponseId, state.ApprovalItemId, request.Approved);
            return BuildCorrespondenceResponse(step, approvalStore, null);
        });

    }

    private static IResult BuildCorrespondenceResponse(AgentStepResult step, PendingApprovalStore approvalStore, string? extracted)
    {
        if (step.Pending is not null)
        {
            var runId = approvalStore.Add(step.Pending.ResponseId, step.Pending.ApprovalItemId, step.Pending.ServerLabel);
            return Results.Ok(new
            {
                status = "pending_approval",
                runId,
                previousResponseId = step.ResponseId,
                toolCall = new { serverLabel = step.Pending.ServerLabel },
                extracted
            });
        }

        return Results.Ok(new
        {
            status = "complete",
            response = step.Result,
            previousResponseId = step.ResponseId,
            extracted
        });
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}
