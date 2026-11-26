import { useFocusEffect, useNavigation } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useNativeSession } from "../../../auth/session-provider";
import { sharePublicLink } from "../../../device/share";
import type { NativeSessionTransport } from "../../../network/transport";
import type { ManagementScreenProps } from "./index";
import { performManagementLink } from "./links";

export function useManagementLinkActions(session: NativeSessionTransport, href: string, locale: "id" | "en",
  overrides?: Pick<ManagementScreenProps, "share" | "openExternal">) {
  const navigation = useNavigation();
  const { getSnapshot } = useNativeSession();
  const focus = useRef<object | null>(null);
  const currentHref = useRef(href);
  const busy = useRef(false);
  const [linkError, setError] = useState<string>();
  useLayoutEffect(() => { currentHref.current = href; }, [href]);

  useFocusEffect(useCallback(() => {
    focus.current = {};
    setError(undefined);
    return () => { focus.current = null; };
  }, [session, href]));

  async function launch(kind: "open" | "share", url: string, title?: string) {
    const epoch = focus.current;
    const current = () => {
      const snapshot = getSnapshot();
      return !!epoch && focus.current === epoch && currentHref.current === href && navigation.isFocused() && session.isCurrent() &&
        snapshot.transport === session && snapshot.state.status === "signed-in" && !snapshot.revalidating;
    };
    if (busy.current || !current()) return;
    busy.current = true;
    setError(undefined);
    try {
      const outcome = await performManagementLink({ kind, url, title }, session.scope.origin, {
        open: async target => {
          if (!overrides?.openExternal) return openBrowserAsync(target);
          await overrides.openExternal(target);
          return { type: "opened" };
        },
        share: async input => {
          if (!overrides?.share) return sharePublicLink(input);
          await overrides.share(input.url, input.title);
          return { status: "finished" };
        },
      }, current);
      if (outcome === "error" && current()) {
        setError(kind === "open" ? (locale === "id" ? "Tautan tidak dapat dibuka." : "Could not open the link.")
          : (locale === "id" ? "Tautan tidak dapat dibagikan." : "Could not share the link."));
      }
    } finally {
      busy.current = false;
    }
  }
  return {
    linkError,
    openExternal: (url: string) => void launch("open", url),
    share: (url: string, title?: string) => void launch("share", url, title),
  };
}
