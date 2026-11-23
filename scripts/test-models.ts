// @ts-nocheck

import { config } from 'dotenv';
import { googleGatewayClient } from "@/lib/ai/provider/google-gateway-client";

config({ path: '.env' });

const ai = googleGatewayClient(process.env.GEMINI_API_KEY!);

const TEST_PROMPT = "Say 'OK' if you can respond.";

interface ModelTestResult {
  modelId: string;
  displayName: string;
  status: 'success' | 'quota_exceeded' | 'not_found' | 'not_supported' | 'error';
  latencyMs?: number;
  errorMessage?: string;
  outputTokens?: number;
}

async function testModel(modelId: string, displayName: string): Promise<ModelTestResult> {
  const t0 = Date.now();
  try {
    const result = await ai.models.generateContent({
      model: modelId,
      contents: TEST_PROMPT,
      config: { maxOutputTokens: 10 },
    });
    const latencyMs = Date.now() - t0;
    const text = result.text || '';
    return {
      modelId,
      displayName,
      status: 'success',
      latencyMs,
      outputTokens: text.length,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - t0;
    const msg = err?.message || String(err);
    let status: ModelTestResult['status'] = 'error';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      status = 'quota_exceeded';
    } else if (msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND')) {
      status = 'not_found';
    } else if (msg.includes('400') && (msg.includes('not supported') || msg.includes('generateContent'))) {
      status = 'not_supported';
    }
    return {
      modelId,
      displayName,
      status,
      latencyMs,
      errorMessage: msg.slice(0, 200),
    };
  }
}

async function main() {
  console.log('Fetching available models...\n');
  const modelsResponse = await ai.models.list();
  const models = modelsResponse.pageInternal || [];

  const generateContentModels = models
    .filter((m: any) => m.supportedActions?.includes('generateContent'))
    .map((m: any) => ({
      modelId: m.name.replace('models/', ''),
      displayName: m.displayName,
      version: m.version,
      inputLimit: m.inputTokenLimit,
      outputLimit: m.outputTokenLimit,
    }));

  console.log(`Found ${generateContentModels.length} models supporting generateContent\n`);

  const results: ModelTestResult[] = [];

  for (let i = 0; i < generateContentModels.length; i++) {
    const { modelId, displayName } = generateContentModels[i];
    console.log(`[${i + 1}/${generateContentModels.length}] Testing ${modelId} (${displayName})...`);
    const result = await testModel(modelId, displayName);
    results.push(result);
    console.log(`  → ${result.status.toUpperCase()}${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}${result.errorMessage ? ` - ${result.errorMessage}` : ''}`);
    
    // Small delay to avoid hitting rate limits during testing
    if (i < generateContentModels.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const byStatus = results.reduce((acc, r) => {
    (acc[r.status] ||= []).push(r);
    return acc;
  }, {} as Record<string, ModelTestResult[]>);

  for (const [status, items] of Object.entries(byStatus)) {
    console.log(`${status.toUpperCase()} (${items.length}):`);
    for (const item of items) {
      console.log(`  ${item.modelId} (${item.displayName})${item.latencyMs ? ` - ${item.latencyMs}ms` : ''}${item.errorMessage ? ` - ${item.errorMessage}` : ''}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('RECOMMENDED PRIORITY ORDER (working models only):');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const working = results.filter(r => r.status === 'success').sort((a, b) => (a.latencyMs || 0) - (b.latencyMs || 0));
  working.forEach((r, i) => {
    console.log(`${i + 1}. ${r.modelId} (${r.displayName}) - ${r.latencyMs}ms`);
  });
}

main().catch(console.error);