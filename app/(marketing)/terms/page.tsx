import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { getTranslations } from "@/lib/i18n/server";
import { createLocalizedMetadata } from "@/lib/site-metadata";
import { LegalDocumentPage, type LegalSection } from "@/components/legal-document-page";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/terms", titleKey: "meta.terms.title", descriptionKey: "meta.terms.description" });
}

type LocalizedBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "privacyLink"; before: string; after: string; href: string };
type LocalizedSection = { title: string; blocks: LocalizedBlock[] };

const sectionIds = [
  "penerimaan", "akun-dan-kelayakan", "penggunaan-layanan", "integritas-akademik",
  "fitur-ai", "konten-dan-kekayaan-intelektual", "layanan-pihak-ketiga", "pembayaran",
  "ketersediaan-dan-penghentian", "batas-tanggung-jawab", "perubahan-ketentuan", "hukum-dan-kontak",
];

export default async function TermsPage() {
  const [t, email] = await Promise.all([
    getTranslations("marketing"),
    Promise.resolve(env.NEXT_PUBLIC_BRAND_EMAIL),
  ]);
  const content = t.raw("terms.sections") as LocalizedSection[];
  const sections: LegalSection[] = content.map((section, index) => ({
    id: sectionIds[index],
    title: section.title,
    content: (
      <>
        {section.blocks.map((block, blockIndex) => {
          if (block.type === "list") {
            return <ul key={blockIndex}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
          }
          if (block.type === "privacyLink") {
            return <p key={blockIndex}>{block.before}<Link href={block.href}>{t("terms.privacyLink")}</Link>{block.after}</p>;
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
      documentId="terms"
      title={t("meta.terms.title")}
      description={t("terms.pageDescription")}
      updatedAt={new Intl.DateTimeFormat(t("legal.localeTag"), { dateStyle: "long", timeZone: "UTC" }).format(new Date("2026-08-30T00:00:00Z"))}
      sections={sections}
    />
  );
}
