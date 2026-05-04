using System.Collections.Concurrent;

namespace ZavaClaims.App.Services;

/// <summary>
/// In-memory store of ChatKit threads and items, used by the floating chatbot's
/// SSE protocol endpoint. Ported from
/// forex-trading-agent/src/research-analytics/Services/ChatKitStore.cs.
/// </summary>
public class ChatKitStore
{
    private readonly ConcurrentDictionary<string, ChatKitThread> _threads = new();

    public ChatKitThread CreateThread()
    {
        var thread = new ChatKitThread
        {
            Id = "thread_" + Guid.NewGuid().ToString("N")[..16],
            CreatedAt = DateTime.UtcNow
        };
        _threads[thread.Id] = thread;
        return thread;
    }

    public ChatKitThread? GetThread(string id) =>
        _threads.TryGetValue(id, out var t) ? t : null;

    public IReadOnlyList<ChatKitThread> ListThreads() =>
        [.. _threads.Values.OrderByDescending(t => t.CreatedAt)];

    public void AddItem(string threadId, ChatKitItem item)
    {
        if (_threads.TryGetValue(threadId, out var thread))
            thread.AddItem(item);
    }
}

public sealed class ChatKitThread
{
    private readonly List<ChatKitItem> _items = [];
    private readonly object _lock = new();

    public string Id { get; init; } = "";
    public string? Title { get; set; }
    public DateTime CreatedAt { get; init; }

    public IReadOnlyList<ChatKitItem> GetItems()
    {
        lock (_lock) return [.. _items];
    }

    public void AddItem(ChatKitItem item)
    {
        lock (_lock) _items.Add(item);
    }
}

public sealed class ChatKitItem
{
    public string Id { get; init; } = "";
    public string ThreadId { get; init; } = "";
    public string Role { get; init; } = "";
    public string Content { get; init; } = "";
    public DateTime CreatedAt { get; init; }
}
