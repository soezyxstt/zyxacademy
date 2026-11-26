import { useMemo } from "react";
import { stripPublicLocalePrefix } from "../../../../lib/public-locale-routes";
import { createPublicClient, PublicScreen, type PublicScreenProps } from "./public";

export type PublicOperationsScreenProps = Omit<PublicScreenProps, "client"> & {
  /** Anonymous public HTTP transport. The default client omits credentials. */
  transport?: typeof fetch;
};

export function PublicOperationsScreen({ transport, ...props }: PublicOperationsScreenProps) {
  const pathname = props.href.split(/[?#]/, 1)[0];
  const locale = stripPublicLocalePrefix(pathname)?.locale ?? props.locale;
  const client = useMemo(() => createPublicClient(props.origin, locale, transport), [props.origin, locale, transport]);
  return <PublicScreen {...props} key={JSON.stringify([props.origin, locale])} locale={locale} client={client} />;
}
