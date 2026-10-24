import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { getTranslations } from "@/lib/i18n/server";
import { createLocalizedMetadata } from "@/lib/site-metadata";
import { LegalDocumentPage, type LegalSection } from "@/components/legal-document-page";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/privacy", titleKey: "meta.privacy.title", descriptionKey: "meta.privacy.description" });
}

type LocalizedBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "link"; before: string; after: string; href: string };
type LocalizedSection = { title: string; blocks: LocalizedBlock[] };

const sectionIds = [
  "cakupan", "data-yang-dikumpulkan", "penggunaan-data", "ai-dan-pihak-ketiga",
  "cookie-dan-penyimpanan-lokal", "penyimpanan-dan-keamanan", "hak-pengguna",
  "pengguna-di-bawah-umur", "perubahan-kebijakan", "kontak",
];

export default async function PrivacyPage() {
  const [t, email] = await Promise.all([
    getTranslations("marketing"),
    Promise.resolve(env.NEXT_PUBLIC_BRAND_EMAIL),
  ]);
  const content = t.raw("privacy.sections") as LocalizedSection[];
  const sections: LegalSection[] = content.map((section, index) => ({
    id: sectionIds[index],
    title: section.title,
    content: (
      <>
        {section.blocks.map((block, blockIndex) => {
          if (block.type === "list") {
            return <ul key={blockIndex}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
          }
          if (block.type === "link") {
            return <p key={blockIndex}>{block.before}<Link href={block.href}>{t("privacy.termsLink")}</Link>{block.after}</p>;
          }
          const [beforeEmail, afterEmail] = block.text.split("{email}");
          return (
            <p key={blockIndex}>
              {beforeEmail}
              {afterEmail !== undefined ? <a href={`mailto:${email}`}>{email}</a> : null}
              {afterEmail}
            </p>
          );
        })}
      </>
    ),
  }));

  return (
    <LegalDocumentPage
      documentId="privacy"
      title={t("meta.privacy.title")}
      description={t("privacy.pageDescription")}
      updatedAt={new Intl.DateTimeFormat(t("legal.localeTag"), { dateStyle: "long", timeZone: "UTC" }).format(new Date("2026-08-30T00:00:00Z"))}
      sections={sections}
    />
  );
}
