import { describe, expect, it } from "bun:test";
import {
  createZyraResponseLanguageState,
  withZyraResponseLanguage,
  zyraInterfaceLocaleChanged,
  zyraResponseLanguageConversationChanged,
  zyraRequestResponseLanguage,
  zyraResponseLanguageResolved,
} from "@/lib/zyra/chat-language-contract";
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";

describe("Zyra chat response language boundary", () => {
  it("sends a bounded locale and preserves the resolved language until interface locale changes", async () => {
    let languageState = createZyraResponseLanguageState("id", "draft");
    const payload = withZyraResponseLanguage(
      { question: "Explain this", courseId: "course-1" },
      languageState,
      "id",
      "draft",
    );

    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    const mockFetch = async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init.body));
      return new Response(
        `data: ${JSON.stringify({ type: "data-response-language", responseLanguage: "en" })}\n\n` +
          "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };

    const response = await mockFetch("/api/zyra/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(capturedUrl).toBe("/api/zyra/chat");
    expect(capturedBody).toEqual({
      question: "Explain this",
      courseId: "course-1",
      responseLanguage: "id",
    });

    let resolvedLanguage: "id" | "en" | null = null;
    for await (const part of consumeZyraStream(response.body!)) {
      if (part.type === "data-response-language") resolvedLanguage = part.responseLanguage;
    }
    expect(resolvedLanguage).toBe("en");

    languageState = zyraResponseLanguageResolved(languageState, resolvedLanguage!);
    expect(zyraRequestResponseLanguage(languageState, "id", "draft")).toBe("en");
    expect(withZyraResponseLanguage({ question: "follow up" }, languageState, "id", "draft").responseLanguage).toBe("en");

    const unchangedLocale = zyraInterfaceLocaleChanged(languageState, "id");
    expect(unchangedLocale.stickyOverride).toBe("en");
    languageState = zyraInterfaceLocaleChanged(languageState, "en");
    expect(languageState).toEqual({ interfaceLocale: "en", conversationKey: "draft", stickyOverride: null });
    expect(withZyraResponseLanguage({ question: "after switch" }, languageState, "en", "draft").responseLanguage).toBe("en");

    languageState = zyraInterfaceLocaleChanged(languageState, "id");
    expect(languageState).toEqual({ interfaceLocale: "id", conversationKey: "draft", stickyOverride: null });
    expect(withZyraResponseLanguage({ question: "back to Indonesian" }, languageState, "id", "draft").responseLanguage).toBe("id");
  });

  it("uses the current interface locale if a stale override survives one render during switching", () => {
    const staleState = zyraResponseLanguageResolved(createZyraResponseLanguageState("id", "draft"), "en");
    expect(withZyraResponseLanguage({ question: "new locale" }, staleState, "en", "draft").responseLanguage).toBe("en");
  });

  it("isolates sticky overrides by conversation and restores only that conversation's remembered override", () => {
    const firstConversation = zyraResponseLanguageResolved(
      createZyraResponseLanguageState("id", "session-a"),
      "en",
    );
    const switched = zyraResponseLanguageConversationChanged(firstConversation, "session-b");
    expect(switched.stickyOverride).toBeNull();
    expect(zyraRequestResponseLanguage(switched, "id", "session-b")).toBe("id");
    expect(withZyraResponseLanguage({ question: "other session" }, firstConversation, "id", "session-b").responseLanguage).toBe("id");

    const secondConversation = zyraResponseLanguageResolved(switched, "id");
    const restoredFirst = zyraResponseLanguageConversationChanged(secondConversation, "session-a", "en");
    expect(restoredFirst.stickyOverride).toBe("en");
    expect(zyraRequestResponseLanguage(restoredFirst, "id", "session-a")).toBe("en");

    const newDraft = zyraResponseLanguageConversationChanged(restoredFirst, "draft");
    expect(newDraft.stickyOverride).toBeNull();
    expect(withZyraResponseLanguage({ question: "fresh chat" }, newDraft, "id", "draft").responseLanguage).toBe("id");
  });
});
