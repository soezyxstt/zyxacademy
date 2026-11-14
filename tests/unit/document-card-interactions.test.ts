import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

test("document open and download controls are siblings and keep separate actions", () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const source = readFileSync("app/(student)/courses/[id]/material/document-list-client.tsx", "utf8");
  const section = source.slice(source.indexOf("function DocumentItemWrapper"), source.indexOf("export function DocumentListClient"));
  const jsx = (type: unknown, props: any) => ({ type, props });
  const module = { exports: {} as any };
  const code = transformSync(section + "\nexport { DocumentItemWrapper };", { loader: "tsx", jsx: "automatic", format: "cjs" }).code;
  runInNewContext(code, { module, exports: module.exports, require: () => ({ jsx, jsxs: jsx }), Link: "link", cn: (...values: string[]) => values.join(" "), getViewablePdfUrl: (url: string) => url, isMobileOrTablet: () => false });
  let opened = 0;
  const download = jsx("a", { href: "/file.pdf", download: true });
  for (const isPageNav of [true, false]) {
    const tree = module.exports.DocumentItemWrapper({ material: { id: "1", title: "Document", kind: "pdf", url: "/file.pdf" }, itemHref: "/document", isPageNav, onSelectPdf: () => opened++, className: "card", children: download });
    const [primary, content] = tree.props.children;
    expect(tree.type).toBe("div");
    expect(primary.type).toBe(isPageNav ? "link" : "button");
    expect(primary.props.children).toBeUndefined();
    expect(primary.props["aria-label"]).toBe("Document");
    expect(content.props.children).toBe(download);
    if (!isPageNav) primary.props.onClick({});
  }
  expect(opened).toBe(1);
});
