import { describe, expect, it } from "bun:test";
import { createMetadata, pageTitle, siteName, siteDescription } from "@/lib/site";

describe("Site Metadata & OpenGraph", () => {
  it("formats pageTitle correctly without duplicating brand", () => {
    expect(pageTitle()).toBe(siteName);
    expect(pageTitle("")).toBe(siteName);
    expect(pageTitle("Pendaftaran Form")).toBe(`Pendaftaran Form · ${siteName}`);
    expect(pageTitle(`Pendaftaran Form · ${siteName}`)).toBe(`Pendaftaran Form · ${siteName}`);
  });

  it("creates metadata with full openGraph and twitter cards for social unfurling", () => {
    const meta = createMetadata({
      title: "Registrasi Tutor",
      description: "Formulir pendaftaran tutor Zyx Academy semester ganjil.",
      path: "/f/registrasi-tutor",
    });

    expect(meta.title).toBe(`Registrasi Tutor · ${siteName}`);
    expect(meta.description).toBe("Formulir pendaftaran tutor Zyx Academy semester ganjil.");

    // OpenGraph assertions (critical for WhatsApp & LINE preview cards)
    const og = meta.openGraph as any;
    expect(og).toBeDefined();
    expect(og.title).toBe(`Registrasi Tutor · ${siteName}`);
    expect(og.description).toBe("Formulir pendaftaran tutor Zyx Academy semester ganjil.");
    expect(og.siteName).toBe(siteName);
    expect(og.locale).toBe("id_ID");
    expect(og.url).toContain("/f/registrasi-tutor");
    expect(og.images[0].url).toContain("/og-image.png");

    // Twitter assertions
    const twitter = meta.twitter as any;
    expect(twitter).toBeDefined();
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.title).toBe(`Registrasi Tutor · ${siteName}`);
    expect(twitter.description).toBe("Formulir pendaftaran tutor Zyx Academy semester ganjil.");
  });

  it("handles fallback default metadata when no options passed", () => {
    const meta = createMetadata();
    expect(meta.title).toBe(siteName);
    expect(meta.description).toBe(siteDescription);
    const og = meta.openGraph as any;
    expect(og.title).toBe(siteName);
    expect(og.description).toBe(siteDescription);
  });
});
