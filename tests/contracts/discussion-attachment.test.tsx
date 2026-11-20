import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscussionI18nFixture } from "./discussion-i18n-fixture";

mock.module("@/lib/i18n/actions", () => ({ saveLocaleSelection: async () => ({ success: true }), mirrorResolvedAccountLocaleCookie: async () => {} }));
mock.module("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
mock.module("@/components/ui/button", () => ({ Button: ({ children }: { children: ReactNode }) => <>{children}</> }));
mock.module("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { Dialog: Wrapper, DialogContent: Wrapper, DialogDescription: Wrapper, DialogHeader: Wrapper, DialogTitle: Wrapper, DialogTrigger: Wrapper };
});

const { DiscussionAttachment } = await import("@/components/discussions/discussion-attachment");

test("attachment uses the private route for preview and download", () => {
  const html = renderToStaticMarkup(<DiscussionI18nFixture><DiscussionAttachment attachment={{ id: "image", name: "diagram.png", url: "/api/discussions/attachments/image", downloadUrl: "https://evil.test/file" }} /></DiscussionI18nFixture>);
  expect(html).toContain('src="/api/discussions/attachments/image?preview=1"');
  expect(html).toContain('src="/api/discussions/attachments/image"');
  expect(html).toContain('href="/api/discussions/attachments/image?download=1"');
  expect(html).toContain('aria-label="Perbesar diagram.png"');
  expect(html).not.toContain("evil.test");
});

test("older images without previews stay openable without fetching the full image in the thumbnail", () => {
  const html = renderToStaticMarkup(<DiscussionI18nFixture><DiscussionAttachment attachment={{ id: "image", name: "diagram.png", url: "/api/discussions/attachments/image", previewAvailable: false }} /></DiscussionI18nFixture>);
  expect(html).toContain("Pratinjau tidak tersedia.");
  expect(html).toContain("Buka gambar");
  expect(html).not.toContain("?preview=1");
  expect(html).toContain('aria-label="Perbesar diagram.png"');
  expect(html).toContain('href="/api/discussions/attachments/image?download=1"');
});

test("invalid attachment URLs render a structured fallback", () => {
  const html = renderToStaticMarkup(<DiscussionI18nFixture><DiscussionAttachment attachment={{ id: "image", name: "diagram.png", url: "https://evil.test/a.png" }} /></DiscussionI18nFixture>);
  expect(html).toContain("Gambar tidak tersedia.");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("evil.test");
});

test("attachment fallbacks use the selected locale", () => {
  const html = renderToStaticMarkup(<DiscussionI18nFixture locale="en"><DiscussionAttachment attachment={{ id: "image", name: "diagram.png", url: "https://evil.test/a.png" }} /></DiscussionI18nFixture>);
  expect(html).toContain("Image unavailable.");
  expect(html).not.toContain("evil.test");
});
