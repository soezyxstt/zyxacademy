import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { authLocale } from "../auth/auth-copy";
import { useNativeAccountContext } from "../auth/use-account-context";
import { loadPublicLinks } from "../features/public-links/client";
import { PublicDirectory, type DirectoryState } from "../features/public-links/directory";

export default function PublicLinksRoute() {
  const { context } = useNativeAccountContext();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DirectoryState>({ status: "loading" });
  useFocusEffect(useCallback(() => {
    const request = new AbortController();
    setState({ status: "loading" });
    void loadPublicLinks(request.signal).then(
      links => { if (!request.signal.aborted) setState({ status: "ready", links }); },
      () => { if (!request.signal.aborted) setState({ status: "error" }); },
    );
    return () => request.abort();
  }, [attempt]));
  return <PublicDirectory state={state} retry={() => setAttempt(value => value + 1)} locale={context?.locale ?? authLocale()} />;
}
