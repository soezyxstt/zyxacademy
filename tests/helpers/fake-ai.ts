export interface FakeAiCallLog {
  systemInstruction?: string;
  userPrompt: string;
  schema?: unknown;
  useCase?: string;
  attemptCount: number;
}

export interface FakeAiResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

class FakeAiAdapter {
  private queue: FakeAiResponse[] = [];
  private calls: FakeAiCallLog[] = [];

  public reset(): void {
    this.queue = [];
    this.calls = [];
  }

  public queueResponse(response: FakeAiResponse): void {
    this.queue.push(response);
  }

  public getCalls(): readonly FakeAiCallLog[] {
    return this.calls;
  }

  public async generate(params: {
    systemInstruction?: string;
    userPrompt: string;
    schema?: unknown;
    useCase?: string;
  }): Promise<FakeAiResponse> {
    // Safety check: ensure no live GEMINI_API_KEY environment variable is required by fake adapter
    if (process.env.TEST_ALLOW_NETWORK === "1") {
      throw new Error("No network guard triggered: TEST_ALLOW_NETWORK must not be set.");
    }

    const nextResponse = this.queue.shift();
    if (!nextResponse) {
      throw new Error("FakeAiAdapter: No queued response available for call.");
    }

    this.calls.push({
      systemInstruction: params.systemInstruction,
      userPrompt: params.userPrompt,
      schema: params.schema,
      useCase: params.useCase,
      attemptCount: this.calls.length + 1,
    });

    return nextResponse;
  }
}

export const fakeAi = new FakeAiAdapter();

export function assertNoNetworkCall(serviceName: string): never {
  throw new Error(`NO_NETWORK_GUARD: Direct network call to ${serviceName} is forbidden in contract tests.`);
}
