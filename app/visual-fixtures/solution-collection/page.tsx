import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { SolutionCollectionReader } from "@/components/course/solution-collection-reader";
import { loadMessages } from "@/lib/i18n/catalogs";
import { CatalogueFixture, ReviewFixture, FixtureSurface } from "./fixture-client";
import { expandedSolutionCollectionFixture, longSolutionCollectionFixture, markdownCodeSolutionCollectionFixture } from "./fixture";

export default async function SolutionCollectionFixturePage({ searchParams }: { searchParams: Promise<{ empty?: string; long?: string; mode?: string; language?: string; hint?: string; markdown?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { empty, long, mode, language, hint, markdown } = await searchParams;
  const base = markdown === "1" ? markdownCodeSolutionCollectionFixture : expandedSolutionCollectionFixture;
  const source = empty === "1" ? { ...base, items: [] } : long === "1" ? longSolutionCollectionFixture : base;
  const collection = hint === "none" ? { ...source, items: source.items.map(({ hintMarkdown: _hint, ...item }) => item) } : source;
  const content = <FixtureSurface><main>{mode === "review" ? <ReviewFixture /> : mode === "catalogue" ? <CatalogueFixture /> : mode === "hierarchy" ? <CatalogueFixture hierarchy /> : <SolutionCollectionReader collection={collection} courseHref="/courses" />}</main></FixtureSurface>;
  return language === "en" ? <NextIntlClientProvider locale="en" timeZone="UTC" messages={await loadMessages("en")}>{content}</NextIntlClientProvider> : content;
}
