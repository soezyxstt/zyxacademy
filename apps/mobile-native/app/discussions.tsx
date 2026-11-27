import { Redirect, useIsFocused, useLocalSearchParams, useRoute } from "expo-router";
import { AuthContinuation, AuthSessionStatus } from "../auth/auth-continuation";
import { authLocale } from "../auth/auth-copy";
import { authEntryHref } from "../auth/login-intent";
import { useNativeSession } from "../auth/session-provider";
import { productLocation } from "../routing/product-location";

export default function DiscussionsAlias() {
  const params = useLocalSearchParams();
  const route = useRoute();
  const focused = useIsFocused();
  const { state } = useNativeSession();
  const locale = authLocale();
  const href = productLocation("/discussions", { ...params, ...route.params, "#": params["#"] });
  if (!focused) return null;
  if (!href) return <Redirect href="/" />;
  if (state.status === "signed-out") return <Redirect href={authEntryHref({ entry: "sign-in", locale, next: href })} />;
  if (state.status === "signed-in") return <AuthContinuation fallbackLocale={locale} next={href} />;
  return <AuthSessionStatus locale={locale} />;
}
