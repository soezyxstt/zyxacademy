import { useLocalSearchParams } from "expo-router";
import { PublicFormRoute } from "../../features/public-forms/route";

export default function FullPublicFormRoute() {
  const { id, locale } = useLocalSearchParams<{ id: string; locale?: string }>();
  return <PublicFormRoute entry="full" identifier={id} requestedLocale={locale} />;
}
