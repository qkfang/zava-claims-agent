using System.Collections.Concurrent;

namespace ZavaClaims.App.Services;

public class PendingApprovalStore
{
    private readonly ConcurrentDictionary<string, PendingRunState> _pending = new();

    public string Add(string previousResponseId, string approvalItemId, string serverLabel)
    {
        var runId = Guid.NewGuid().ToString("N");
        _pending[runId] = new PendingRunState(previousResponseId, approvalItemId, serverLabel);
        return runId;
    }

    public PendingRunState? Get(string runId) =>
        _pending.TryGetValue(runId, out var state) ? state : null;

    public void Remove(string runId) => _pending.TryRemove(runId, out _);
}

public record PendingRunState(string PreviousResponseId, string ApprovalItemId, string ServerLabel);
