import { useLocalSearchParams } from "expo-router";
import { PublicFormRoute } from "../../features/public-forms/route";

export default function ShortPublicFormRoute() {
  const { slug, locale } = useLocalSearchParams<{ slug: string; locale?: string }>();
  return <PublicFormRoute entry="short" identifier={slug} requestedLocale={locale} />;
}
