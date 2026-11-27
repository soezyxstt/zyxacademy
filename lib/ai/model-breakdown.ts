type Sample = { model: string; latencyMs: number; success: boolean };

export function aiModelBreakdown(recentLogs: readonly Sample[]) {
  const byModel = new Map<string, { model: string; count: number; successes: number; totalLatencyMs: number }>();
  for (const log of recentLogs) {
    const model = log.model || "unknown";
    const entry = byModel.get(model) ?? { model, count: 0, successes: 0, totalLatencyMs: 0 };
    entry.count += 1;
    if (log.success) entry.successes += 1;
    entry.totalLatencyMs += log.latencyMs;
    byModel.set(model, entry);
  }
  return [...byModel.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ model, count, successes, totalLatencyMs }) => ({
      model, count,
      sharePct: Math.round(count / recentLogs.length * 100),
      successRatePct: Math.round(successes / count * 100),
      avgLatencyMs: totalLatencyMs / count,
    }));
}

export function formatAiLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
