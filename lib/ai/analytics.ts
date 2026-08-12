/**
 * lib/ai/analytics.ts
 *
 * Lightweight, zero-dependency AI observability layer.
 *
 * Collects per-request metrics (operation, model, gateway vs direct, latency,
 * success/failure) in a ring buffer and exposes them via `getAiStats()` for
 * the admin dashboard. In production you could also forward events to a
 * telemetry sink (Logflare, Axiom, etc.) by extending `logAiRequest`.
 */

export interface AiRequestLog {
 /** ISO timestamp of when the request was made */
 timestamp: string;
 /** Type of AI operation performed */
 operation: 'generateContent' | 'interactions' | 'embed';
 /** Model name used (e.g. 'gemini-3.5-flash', 'gemini-embedding-2') */
 model: string;
 /** Whether the request was routed through Cloudflare AI Gateway */
 viaGateway: boolean;
 /** Wall-clock latency in milliseconds */
 latencyMs: number;
 /** Whether the call succeeded */
 success: boolean;
 /** Error message if the call failed */
 error?: string;
}

export interface AiStats {
 totalRequests: number;
 successfulRequests: number;
 failedRequests: number;
 gatewayRequests: number;
 directRequests: number;
 averageLatencyMs: number;
 gatewaySuccessRate: number;
 directSuccessRate: number;
 recentLogs: AiRequestLog[];
}

// Ring buffer ; keeps the last N entries in memory (process lifetime)
const MAX_LOG_ENTRIES = 500;
const logBuffer: AiRequestLog[] = [];

/**
 * Record a single AI API call. Called automatically by `lib/gemini.ts`;
 * application code does NOT need to call this directly.
 */
export function logAiRequest(entry: Omit<AiRequestLog, 'timestamp'>): void {
 const record: AiRequestLog = {
 timestamp: new Date().toISOString(),
 ...entry,
 };

 if (logBuffer.length >= MAX_LOG_ENTRIES) {
 logBuffer.shift(); // drop oldest
 }
 logBuffer.push(record);

 // Development console output
 if (process.env.NODE_ENV === 'development') {
 const via = record.viaGateway ? '[gateway]' : '[direct]';
 const status = record.success ? '✅' : '❌';
 console.log(
 `[AI] ${status} ${via} ${record.operation} model=${record.model} latency=${record.latencyMs}ms`
 );
 }
}

/**
 * Compute aggregate statistics from the in-memory log buffer.
 * Called by the admin analytics API route.
 */
export function getAiStats(): AiStats {
 const total = logBuffer.length;

 if (total === 0) {
 return {
 totalRequests: 0,
 successfulRequests: 0,
 failedRequests: 0,
 gatewayRequests: 0,
 directRequests: 0,
 averageLatencyMs: 0,
 gatewaySuccessRate: 0,
 directSuccessRate: 0,
 recentLogs: [],
 };
 }

 const successful = logBuffer.filter((l) => l.success).length;
 const gateway = logBuffer.filter((l) => l.viaGateway);
 const direct = logBuffer.filter((l) => !l.viaGateway);

 const avgLatency =
 logBuffer.reduce((s, l) => s + l.latencyMs, 0) / total;

 const gwSuccessRate =
 gateway.length > 0
 ? gateway.filter((l) => l.success).length / gateway.length
 : 0;

 const directSuccessRate =
 direct.length > 0
 ? direct.filter((l) => l.success).length / direct.length
 : 0;

 return {
 totalRequests: total,
 successfulRequests: successful,
 failedRequests: total - successful,
 gatewayRequests: gateway.length,
 directRequests: direct.length,
 averageLatencyMs: Math.round(avgLatency),
 gatewaySuccessRate: Math.round(gwSuccessRate * 1000) / 10, // % with 1dp
 directSuccessRate: Math.round(directSuccessRate * 1000) / 10,
 recentLogs: [...logBuffer].reverse().slice(0, 50), // most recent 50
 };
}

/**
 * Clears the in-memory log buffer. Useful for testing.
 */
export function clearAiStats(): void {
 logBuffer.length = 0;
}
