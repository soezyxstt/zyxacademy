import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';
import { getRpdLimit } from '@/lib/ai-router';
import { todayUtc } from '@/lib/date-utils';

export interface GeminiKey {
  id: string;
  key: string;
  client: GoogleGenAI;
  clientGateway: GoogleGenAI | null;
  errorCount: number;
  lastErrorAt: number;
  isHealthy: boolean;
}

export interface KeyModelSchedulerState {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  circuitState: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  cooldownUntil: number;
  estimatedRpmLimit: number;
  lastUsedAt: number;
  requestTimestamps: number[];
  activeRequests: { id: string; timestamp: number }[];
  requestDates: string[];
  rpdLimit: number;
}

export interface KeyModelDiagnostics {
  keyId: string;
  modelId: string;
  requestsMinute: number;
  requestsToday: number;
  rpdLimit: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  circuitState: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  cooldownRemainingMs: number;
  estimatedRpmLimit: number;
  utilizationPercent: number;
  activeRequestsCount: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function getDefaultRpmLimit(modelId: string): number {
  const modelLower = modelId.toLowerCase();
  if (modelLower.includes('pro')) {
    return 2;
  }
  if (modelLower.includes('embed')) {
    return 1500;
  }
  return 15; // default for flash/lite/gemma models
}

function createClients(apiKey: string, gatewayUrl?: string) {
  const direct = new GoogleGenAI({ apiKey });
  const gateway = gatewayUrl
    ? new GoogleGenAI({
        apiKey,
        httpOptions: {
          baseUrl: gatewayUrl,
          headers: env.CF_AI_GATEWAY_TOKEN
            ? { 'cf-aig-authorization': `Bearer ${env.CF_AI_GATEWAY_TOKEN}` }
            : {},
        },
      })
    : null;
  return { direct, gateway };
}

export class GeminiKeyPool {
  private keys: GeminiKey[] = [];
  private schedulerStates = new Map<string, KeyModelSchedulerState>();

  constructor() {
    const gatewayUrl = env.CF_AI_GATEWAY_URL;

    const keyConfigs = [
      { id: 'key1', key: env.GEMINI_API_KEY },
      { id: 'key2', key: env.GEMINI_API_KEY_2 },
      { id: 'key3', key: env.GEMINI_API_KEY_3 },
      { id: 'key4', key: env.GEMINI_API_KEY_4 },
    ].filter((k): k is { id: string; key: string } => !!k.key);

    if (keyConfigs.length === 0) {
      throw new Error('At least GEMINI_API_KEY must be set');
    }

    this.keys = keyConfigs.map(({ id, key }) => {
      const { direct, gateway } = createClients(key, gatewayUrl);
      return {
        id,
        key,
        client: direct,
        clientGateway: gateway,
        errorCount: 0,
        lastErrorAt: 0,
        isHealthy: true,
      };
    });

    console.log(`[GeminiKeyPool] Initialized with ${this.keys.length} key(s): ${this.keys.map(k => k.id).join(', ')}`);
  }

  private getSchedulerState(keyId: string, modelId: string): KeyModelSchedulerState {
    const mapKey = `${keyId}:${modelId}`;
    let state = this.schedulerStates.get(mapKey);
    if (!state) {
      state = {
        successes: 0,
        failures: 0,
        consecutiveFailures: 0,
        circuitState: 'CLOSED',
        cooldownUntil: 0,
        estimatedRpmLimit: getDefaultRpmLimit(modelId),
        lastUsedAt: 0,
        requestTimestamps: [],
        activeRequests: [],
        requestDates: [],
        rpdLimit: getRpdLimit(modelId),
      };
      this.schedulerStates.set(mapKey, state);
    }
    return state;
  }

  private cleanAndGetRpm(state: KeyModelSchedulerState, now: number): number {
    state.requestTimestamps = state.requestTimestamps.filter(t => now - t < 60000);
    return state.requestTimestamps.length;
  }

  private cleanAndGetActiveCount(state: KeyModelSchedulerState, now: number): number {
    state.activeRequests = state.activeRequests.filter(req => now - req.timestamp < 60000);
    return state.activeRequests.length;
  }

  private getTodayStr(): string {
    return todayUtc();
  }

  private cleanAndGetRpd(state: KeyModelSchedulerState): number {
    const today = this.getTodayStr();
    state.requestDates = state.requestDates.filter(d => d === today);
    return state.requestDates.length;
  }

  private releaseActiveRequest(state: KeyModelSchedulerState): void {
    if (state.activeRequests.length > 0) {
      state.activeRequests.shift();
    }
  }

  private extractRetryAfterMs(error: any): number {
    if (!error) return 0;

    // 1. Check response headers
    if (error.headers) {
      let retryAfterHeader: string | null = null;
      if (typeof error.headers.get === 'function') {
        retryAfterHeader = error.headers.get('retry-after');
      } else if (error.headers['retry-after']) {
        retryAfterHeader = String(error.headers['retry-after']);
      }

      if (retryAfterHeader) {
        const seconds = parseFloat(retryAfterHeader);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
        const date = Date.parse(retryAfterHeader);
        if (!isNaN(date)) {
          return Math.max(0, date - Date.now());
        }
      }
    }

    // 2. Check error object properties
    if (typeof error.retryAfter === 'number') {
      return error.retryAfter * 1000;
    }
    if (typeof error.retryAfterMs === 'number') {
      return error.retryAfterMs;
    }

    // 3. Search in error message/content
    const msg = error.message || String(error);
    const secondsRegex = /(?:retry after|try again in|retry in)\s+(\d+(?:\.\d+)?)\s*s/i;
    const matchSec = msg.match(secondsRegex);
    if (matchSec) {
      return parseFloat(matchSec[1]) * 1000;
    }

    const msRegex = /(?:retry after|try again in|retry in)\s+(\d+)\s*ms/i;
    const matchMs = msg.match(msRegex);
    if (matchMs) {
      return parseInt(matchMs[1], 10);
    }

    return 0;
  }

  private syncKeyLevelState(keyId: string): void {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) return;

    const states = Array.from(this.schedulerStates.entries())
      .filter(([mapKey]) => mapKey.startsWith(`${keyId}:`))
      .map(([, s]) => s);

    if (states.length === 0) return;

    const allOpen = states.length > 0 && states.every(s => s.circuitState === 'OPEN');
    const maxConsecutiveFailures = states.reduce((max, s) => Math.max(max, s.consecutiveFailures), 0);
    const maxCooldownUntil = states.reduce((max, s) => Math.max(max, s.cooldownUntil), 0);

    key.errorCount = maxConsecutiveFailures;
    key.lastErrorAt = maxCooldownUntil > 0 ? maxCooldownUntil - CIRCUIT_BREAKER_COOLDOWN_MS : 0;
    key.isHealthy = !allOpen;
  }

  // --- Core API ---

  getBestKey(modelId: string): GeminiKey | null {
    const now = Date.now();
    const today = this.getTodayStr();
    let bestKey: GeminiKey | null = null;
    let bestScore = -Infinity;

    for (const key of this.keys) {
      const state = this.getSchedulerState(key.id, modelId);

      // Check RPD (daily quota); skip if exhausted for today
      const todayCount = this.cleanAndGetRpd(state);
      if (todayCount >= state.rpdLimit) {
        continue;
      }

      // Check circuit breaker transition
      if (state.circuitState === 'OPEN') {
        if (now >= state.cooldownUntil) {
          state.circuitState = 'HALF_OPEN';
          console.log(`[GeminiKeyPool] Key ${key.id} model ${modelId} transitioned to HALF_OPEN`);
        } else {
          continue;
        }
      }

      // Skip CLOSED keys still in a temporary cooldown window
      if (state.circuitState === 'CLOSED' && now < state.cooldownUntil) {
        continue;
      }

      // Check HALF_OPEN active probe limit
      if (state.circuitState === 'HALF_OPEN') {
        const activeCount = this.cleanAndGetActiveCount(state, now);
        if (activeCount > 0) {
          continue;
        }
      }

      // Check sliding window limits
      const currentRpm = this.cleanAndGetRpm(state, now);
      const activeCount = this.cleanAndGetActiveCount(state, now);

      if (currentRpm >= state.estimatedRpmLimit) {
        continue;
      }

      // Score-based selection
      let score = 0;
      if (state.circuitState === 'HALF_OPEN') {
        score = (state.estimatedRpmLimit / 2) + Math.random() * 0.1;
      } else {
        const remainingCapacity = state.estimatedRpmLimit - currentRpm;
        const utilization = currentRpm / state.estimatedRpmLimit;
        const penalty = utilization >= 0.9 ? -100 : 0;
        score = (remainingCapacity / (activeCount + 1)) + penalty + Math.random() * 0.1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    if (bestKey) {
      const state = this.getSchedulerState(bestKey.id, modelId);
      const requestId = Math.random().toString(36).substring(7);
      state.requestTimestamps.push(now);
      state.activeRequests.push({ id: requestId, timestamp: now });
      state.requestDates.push(today);
      state.lastUsedAt = now;
    }

    return bestKey;
  }

  markSuccess(keyId: string, modelId: string): void {
    const state = this.getSchedulerState(keyId, modelId);
    this.releaseActiveRequest(state);

    state.successes++;

    if (state.circuitState === 'HALF_OPEN') {
      state.circuitState = 'CLOSED';
      state.consecutiveFailures = 0;
      console.log(`[GeminiKeyPool] Key ${keyId} model ${modelId} recovered to CLOSED`);
    } else if (state.circuitState === 'CLOSED') {
      state.consecutiveFailures = 0;
    }

    const defaultLimit = getDefaultRpmLimit(modelId);
    if (state.estimatedRpmLimit < defaultLimit) {
      state.estimatedRpmLimit = Math.min(defaultLimit, state.estimatedRpmLimit + 0.5);
    }

    this.syncKeyLevelState(keyId);
  }

  markFailure(keyId: string, modelId: string, error: Error): void {
    const state = this.getSchedulerState(keyId, modelId);
    this.releaseActiveRequest(state);

    state.failures++;

    const isRateLimit = error.message?.includes('429') || 
                        error.message?.includes('quota') || 
                        error.message?.includes('RESOURCE_EXHAUSTED') ||
                        String(error).includes('429');

    const now = Date.now();

    if (isRateLimit) {
      const currentRpm = this.cleanAndGetRpm(state, now);
      const newLimit = Math.max(1, Math.min(currentRpm, Math.floor(state.estimatedRpmLimit * 0.8)));
      state.estimatedRpmLimit = newLimit;
      console.warn(`[GeminiKeyPool] Key ${keyId} model ${modelId} rate limited. New limit: ${newLimit}. Current RPM: ${currentRpm}`);

      const retryAfterMs = this.extractRetryAfterMs(error);
      state.consecutiveFailures++;
      if (retryAfterMs > 0) {
        state.cooldownUntil = now + retryAfterMs;
        console.warn(`[GeminiKeyPool] Key ${keyId} model ${modelId} cooling down for ${retryAfterMs / 1000}s (retry-after)`);
      } else {
        const backoffMs = Math.min(1000 * Math.pow(2, state.consecutiveFailures) + Math.random() * 500, 300000);
        state.cooldownUntil = now + backoffMs;
        console.warn(`[GeminiKeyPool] Key ${keyId} model ${modelId} cooling down for ${backoffMs / 1000}s (exponential backoff)`);
      }

      if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        state.circuitState = 'OPEN';
        state.cooldownUntil = Math.max(state.cooldownUntil, now + CIRCUIT_BREAKER_COOLDOWN_MS);
        console.error(`[GeminiKeyPool] Key ${keyId} model ${modelId} CIRCUIT OPEN (rate limits) - cooling down until ${new Date(state.cooldownUntil).toISOString()}`);
      }
    } else {
      state.consecutiveFailures++;
      const retryAfterMs = this.extractRetryAfterMs(error);

      if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD || state.circuitState === 'HALF_OPEN') {
        state.circuitState = 'OPEN';
        const cooldownMs = retryAfterMs > 0 ? retryAfterMs : CIRCUIT_BREAKER_COOLDOWN_MS;
        state.cooldownUntil = now + cooldownMs;
        console.error(`[GeminiKeyPool] Key ${keyId} model ${modelId} CIRCUIT OPEN (errors) - cooling down for ${cooldownMs / 1000}s`);
      } else {
        const cooldownMs = retryAfterMs > 0 ? retryAfterMs : Math.min(1000 * Math.pow(2, state.consecutiveFailures), 300000);
        state.cooldownUntil = now + cooldownMs;
        console.warn(`[GeminiKeyPool] Key ${keyId} model ${modelId} temporary error cooldown for ${cooldownMs / 1000}s`);
      }
    }

    this.syncKeyLevelState(keyId);
  }

  // --- Diagnostics & Stats API ---

  getDiagnostics(): KeyModelDiagnostics[] {
    const now = Date.now();
    const diagnostics: KeyModelDiagnostics[] = [];

    for (const [mapKey, state] of this.schedulerStates.entries()) {
      const [keyId, modelId] = mapKey.split(':');
      const currentRpm = this.cleanAndGetRpm(state, now);
      const activeCount = this.cleanAndGetActiveCount(state, now);
      const todayCount = this.cleanAndGetRpd(state);
      const cooldownRemainingMs = Math.max(0, state.cooldownUntil - now);
      const utilizationPercent = Math.min(100, (currentRpm / state.estimatedRpmLimit) * 100);

      diagnostics.push({
        keyId,
        modelId,
        requestsMinute: currentRpm,
        requestsToday: todayCount,
        rpdLimit: state.rpdLimit,
        successes: state.successes,
        failures: state.failures,
        consecutiveFailures: state.consecutiveFailures,
        circuitState: state.circuitState,
        cooldownRemainingMs,
        estimatedRpmLimit: state.estimatedRpmLimit,
        utilizationPercent,
        activeRequestsCount: activeCount,
      });
    }

    return diagnostics;
  }

  // --- Backward Compatibility ---

  getAllKeys(): GeminiKey[] {
    return this.keys;
  }

  getHealthyKeys(): GeminiKey[] {
    const now = Date.now();
    return this.keys.filter(k => {
      const states = Array.from(this.schedulerStates.entries())
        .filter(([mapKey]) => mapKey.startsWith(`${k.id}:`))
        .map(([, s]) => s);

      for (const state of states) {
        if (state.circuitState === 'OPEN' && now >= state.cooldownUntil) {
          state.circuitState = 'HALF_OPEN';
          console.log(`[GeminiKeyPool] Key ${k.id} model circuit breaker transitioned to HALF_OPEN (compatibility path)`);
        }
      }

      this.syncKeyLevelState(k.id);
      return k.isHealthy;
    });
  }

  getNextKey(modelId: string): GeminiKey | null {
    return this.getBestKey(modelId);
  }

  markKeyFailed(keyId: string, error: Error): void {
    this.markFailure(keyId, 'gemini-2.5-flash', error);
  }

  markKeySuccess(keyId: string): void {
    this.markSuccess(keyId, 'gemini-2.5-flash');
  }

  getStats() {
    return this.keys.map(k => {
      const states = Array.from(this.schedulerStates.entries())
        .filter(([mapKey]) => mapKey.startsWith(`${k.id}:`))
        .map(([, s]) => s);

      const anyOpen = states.some(s => s.circuitState === 'OPEN');
      const maxErrors = states.reduce((max, s) => Math.max(max, s.consecutiveFailures), 0);
      const maxCooldown = states.reduce((max, s) => Math.max(max, s.cooldownUntil), 0);

      return {
        id: k.id,
        healthy: !anyOpen,
        errorCount: maxErrors,
        lastErrorAt: maxCooldown > 0 ? maxCooldown - CIRCUIT_BREAKER_COOLDOWN_MS : 0,
      };
    });
  }
}

export const geminiKeyPool = new GeminiKeyPool();