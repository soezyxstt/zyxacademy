import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import posthog from "posthog-js";
import { PostHogContext, usePostHog } from "posthog-js/react";
import { PostHogProvider } from "@/components/providers/posthog-provider";

const outerClient = {} as typeof posthog;

function ContextProbe() {
  const client = usePostHog();
  return <span>{client === posthog ? "sdk" : client === outerClient ? "outer" : "unexpected"}</span>;
}

function render(pathname: string, apiKey?: string) {
  return renderToStaticMarkup(
    <PathnameContext.Provider value={pathname}>
      <PostHogContext.Provider value={{ client: outerClient }}>
        <PostHogProvider apiKey={apiKey} apiHost="https://analytics.example.test">
          <ContextProbe />
        </PostHogProvider>
      </PostHogContext.Provider>
    </PathnameContext.Provider>,
  );
}

test("configured demo and account pages render immediately with the official SDK context", () => {
  const enabled = process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_POSTHOG_DEV === "true";
  const expected = enabled ? "<span>sdk</span>" : "<span>outer</span>";
  expect(render("/demo", "public-key")).toBe(expected);
  expect(render("/profile", "public-key")).toBe(expected);
});

test("unconfigured and verification pages still render children without the SDK provider", () => {
  expect(render("/demo")).toBe("<span>outer</span>");
  expect(render("/authoring-verification", "public-key")).toBe("<span>outer</span>");
  expect(render("/v4", "public-key")).toBe("<span>outer</span>");
});
