import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryProvider } from "@/components/providers/query-provider";

test("the global account boundary leaves server markup intact without a browser or locale provider", () => {
  const html = renderToStaticMarkup(<QueryProvider><main id="main-content">Server content</main></QueryProvider>);
  expect(html).toBe('<main id="main-content">Server content</main>');
});
