using System.Text.Json;

namespace ZavaClaims.App.Services;

/// <summary>
/// Implements the openai/chatkit-js compatible SSE protocol used by the floating
/// chatbot. Ported from
/// forex-trading-agent/src/research-analytics/Services/ChatKitHandler.cs.
/// </summary>
public static class ChatKitHandler
{
    private static readonly JsonSerializerOptions _opts = new() { PropertyNamingPolicy = null };

    public static async Task HandleAsync(HttpContext ctx, ChatKitStore store, ChatService chatService)
    {
        using var reader = new StreamReader(ctx.Request.Body);
        var body = await reader.ReadToEndAsync();
        using var doc = JsonDocument.Parse(body);
        var requestType = doc.RootElement.GetProperty("type").GetString();

        switch (requestType)
        {
            case "threads.create":
            case "threads.add_user_message":
            case "threads.retry_after_item":
                await HandleStreamAsync(ctx, store, chatService, doc, requestType!);
                break;

            case "threads.list":
                await WriteJsonAsync(ctx, new
                {
                    data = store.ListThreads()
                        .Select(t => new { id = t.Id, title = t.Title, created_at = t.CreatedAt })
                        .ToArray(),
                    has_more = false
                });
                break;

            case "items.list":
            {
                var threadId = doc.RootElement.GetProperty("params").GetProperty("thread_id").GetString() ?? "";
                var thread = store.GetThread(threadId);
                var items = BuildItemsPayload(thread?.GetItems() ?? []);
                await WriteJsonAsync(ctx, new { data = items, has_more = false });
                break;
            }

            case "threads.get_by_id":
            {
                var threadId = doc.RootElement.GetProperty("params").GetProperty("thread_id").GetString() ?? "";
                var thread = store.GetThread(threadId);
                if (thread is null) { ctx.Response.StatusCode = 404; return; }
                await WriteJsonAsync(ctx, new { id = thread.Id, title = thread.Title, created_at = thread.CreatedAt });
                break;
            }

            case "threads.update":
            {
                var p = doc.RootElement.GetProperty("params");
                var threadId = p.GetProperty("thread_id").GetString() ?? "";
                var title = p.TryGetProperty("title", out var t) ? t.GetString() : null;
                var thread = store.GetThread(threadId);
                if (thread is not null) thread.Title = title;
                await WriteJsonAsync(ctx, new { id = thread?.Id, title = thread?.Title, created_at = thread?.CreatedAt });
                break;
            }

            case "threads.delete":
            case "items.feedback":
                ctx.Response.ContentType = "application/json";
                await ctx.Response.WriteAsync("{}");
                break;

            default:
                ctx.Response.StatusCode = 400;
                break;
        }
    }

    private static async Task HandleStreamAsync(
        HttpContext ctx, ChatKitStore store, ChatService chatService,
        JsonDocument doc, string requestType)
    {
        ctx.Response.ContentType = "text/event-stream";
        ctx.Response.Headers.CacheControl = "no-cache";
        ctx.Response.Headers["X-Accel-Buffering"] = "no";

        var p = doc.RootElement.GetProperty("params");

        ChatKitThread thread;
        string userText;

        if (requestType == "threads.create")
        {
            thread = store.CreateThread();
            userText = GetInputText(p);
            await WriteEventAsync(ctx, new
            {
                type = "thread.created",
                thread = new { id = thread.Id, title = thread.Title, created_at = thread.CreatedAt }
            });
        }
        else
        {
            var threadId = p.GetProperty("thread_id").GetString() ?? "";
            thread = store.GetThread(threadId) ?? store.CreateThread();
            userText = GetInputText(p);
        }

        var history = thread.GetItems()
            .Select(i => new ChatTurn { Role = i.Role, Content = i.Content })
            .ToList();

        var userItem = new ChatKitItem
        {
            Id = "msg_" + Guid.NewGuid().ToString("N")[..16],
            ThreadId = thread.Id,
            Role = "user",
            Content = userText,
            CreatedAt = DateTime.UtcNow
        };
        store.AddItem(thread.Id, userItem);

        await WriteEventAsync(ctx, new
        {
            type = "thread.item.done",
            item = new
            {
                type = "user_message",
                id = userItem.Id,
                thread_id = thread.Id,
                created_at = userItem.CreatedAt,
                content = userText,
                attachments = Array.Empty<object>()
            }
        });

        await WriteEventAsync(ctx, new { type = "stream_options", allow_cancel = false });

        if (string.IsNullOrWhiteSpace(userText))
        {
            await WriteEventAsync(ctx, new
            {
                type = "thread.item.done",
                item = new
                {
                    type = "assistant_message",
                    id = "msg_" + Guid.NewGuid().ToString("N")[..16],
                    thread_id = thread.Id,
                    created_at = DateTime.UtcNow,
                    content = new[] { new { type = "output_text", text = "Please enter a message.", annotations = Array.Empty<object>() } }
                }
            });
            return;
        }

        var reply = await chatService.SendMessageAsync(userText, history);

        var assistantItem = new ChatKitItem
        {
            Id = "msg_" + Guid.NewGuid().ToString("N")[..16],
            ThreadId = thread.Id,
            Role = "assistant",
            Content = reply,
            CreatedAt = DateTime.UtcNow
        };
        store.AddItem(thread.Id, assistantItem);

        await WriteEventAsync(ctx, new
        {
            type = "thread.item.done",
            item = new
            {
                type = "assistant_message",
                id = assistantItem.Id,
                thread_id = thread.Id,
                created_at = assistantItem.CreatedAt,
                content = new[]
                {
                    new { type = "output_text", text = reply, annotations = Array.Empty<object>() }
                }
            }
        });
    }

    private static async Task WriteEventAsync(HttpContext ctx, object data)
    {
        var json = JsonSerializer.Serialize(data, _opts);
        await ctx.Response.WriteAsync("data: " + json + "\n\n");
        await ctx.Response.Body.FlushAsync();
    }

    private static async Task WriteJsonAsync(HttpContext ctx, object data)
    {
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(JsonSerializer.Serialize(data, _opts));
    }

    private static string GetInputText(JsonElement paramsElem)
    {
        if (paramsElem.TryGetProperty("input", out var input))
        {
            if (input.TryGetProperty("content", out var content))
            {
                if (content.ValueKind == JsonValueKind.String)
                    return content.GetString() ?? "";

                if (content.ValueKind == JsonValueKind.Array)
                    return string.Join("", content.EnumerateArray()
                        .Select(c =>
                        {
                            if (c.ValueKind == JsonValueKind.String) return c.GetString() ?? "";
                            if (c.TryGetProperty("text", out var t)) return t.GetString() ?? "";
                            return "";
                        }));
            }
        }

        if (paramsElem.TryGetProperty("text", out var text))
            return text.GetString() ?? "";

        return "";
    }

    private static object[] BuildItemsPayload(IReadOnlyList<ChatKitItem> items)
    {
        var result = new List<object>();
        foreach (var item in items)
        {
            if (item.Role == "user")
                result.Add(new
                {
                    type = "user_message",
                    id = item.Id,
                    thread_id = item.ThreadId,
                    created_at = item.CreatedAt,
                    content = item.Content,
                    attachments = Array.Empty<object>()
                });
            else
                result.Add(new
                {
                    type = "assistant_message",
                    id = item.Id,
                    thread_id = item.ThreadId,
                    created_at = item.CreatedAt,
                    content = new[]
                    {
                        new { type = "output_text", text = item.Content, annotations = Array.Empty<object>() }
                    }
                });
        }
        return [.. result];
    }
}
