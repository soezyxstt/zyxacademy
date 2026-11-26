import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { authLocale } from "../../auth/auth-copy";
import { authEntryHref } from "../../auth/login-intent";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import type { NativeSessionTransport } from "../../network/transport";
import { createFormSubmissionGate, loadPublicForm, submitPublicForm } from "./client";
import { pickAndUploadFormFile, requestPublicForm } from "./expo-client";
import { formIdentifier, formUploadPolicy, publicFormPath, type FormEntry, type FormLocale, type PublicForm, type PublicFormLoad } from "./model";
import { PublicFormResponse } from "./response";
import { PublicFormScreen } from "./screen";

type WebStatus = "idle" | "opening" | "error";

export function PublicFormRoute({ entry, identifier: raw, requestedLocale }: { entry: FormEntry; identifier: unknown; requestedLocale?: string }) {
  const id = formIdentifier(raw);
  const { context } = useNativeAccountContext();
  const locale: FormLocale = context?.locale ?? authLocale(requestedLocale);
  return <PublicFormLocation key={JSON.stringify([entry, id, locale])} entry={entry} id={id} locale={locale} />;
}

function PublicFormLocation({ id, entry, locale }: { id: string | null; entry: FormEntry; locale: FormLocale }) {
  const { state, transport, revalidating, refresh } = useNativeSession();
  const router = useRouter();
  const [data, setData] = useState<PublicFormLoad | null>(id ? null : { status: "missing" });
  const [web, setWeb] = useState<WebStatus>("idle");
  const [statusCheck, setStatusCheck] = useState(0);
  const [submissionGate] = useState(createFormSubmissionGate);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const read = useRef<AbortController | null>(null);
  const browser = useRef(false);
  const route = id ? publicFormPath(entry, id) : null;

  function load(keepDraft = false) {
    if (!id) return;
    read.current?.abort();
    setChecking(keepDraft);
    setCheckFailed(false);
    const controller = new AbortController();
    read.current = controller;
    void loadPublicForm(requestPublicForm, entry, id, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setChecking(false);
      if (keepDraft && result.status === "error") {
        setCheckFailed(true);
        return;
      }
      setData(result);
      setStatusCheck(sequence => sequence + 1);
    });
  }

  useEffect(() => {
    load();
    return () => read.current?.abort();
  }, [entry, id]);

  function tryAgain() {
    setWeb("idle");
    setData(null);
    if (state.status !== "signed-out") void refresh();
    load();
  }

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  function login() {
    if (route) router.push(authEntryHref({ entry: "sign-in", locale, next: route }));
  }

  async function open(url: string | null) {
    if (!url || browser.current) return;
    browser.current = true;
    setWeb("opening");
    try {
      await openBrowserAsync(url);
      setWeb("idle");
    } catch {
      setWeb("error");
    } finally {
      browser.current = false;
    }
  }

  const openWeb = () => void open(route && (NATIVE_STAGING_ORIGIN + route));
  const signedIn = state.status === "signed-in" && transport?.isCurrent() ? transport : null;
  const access = state.status === "loading" || revalidating ? "waiting"
    : state.status === "signed-out" ? "anonymous" : signedIn ? "signed-in" : "unavailable";
  const form = data?.status === "ready" ? data.form : null;
  const formKey = useMemo(() => JSON.stringify([signedIn?.scope ?? "anonymous", form]), [signedIn?.scope, form]);

  return <PublicFormScreen state={data} locale={locale} access={access} opening={web === "opening"} browserFailed={web === "error"}
    onRetry={tryAgain} onLogin={login} onWeb={openWeb} onMeet={() => void open(data?.status === "meeting" ? data.url : null)} onBack={leave}>
    {form && route && (access === "anonymous" || access === "signed-in") && (
      <FormSession key={formKey}
        locale={locale} route={route} form={form} transport={signedIn}
        onLogin={login} onWeb={openWeb} onCheck={() => load(true)} statusCheck={statusCheck}
        checking={checking} checkFailed={checkFailed} onDone={leave} submissionGate={submissionGate} />
    )}
  </PublicFormScreen>;
}

function FormSession({ form, locale, route, transport, onLogin, onWeb, onCheck, onDone, statusCheck, checking, checkFailed, submissionGate }: {
  form: PublicForm; locale: FormLocale; route: string; transport: NativeSessionTransport | null;
  onLogin(): void; onWeb(): void; onCheck(): void; onDone(): void; statusCheck: number; checking: boolean; checkFailed: boolean;
  submissionGate: ReturnType<typeof createFormSubmissionGate>;
}) {
  const lifetime = useRef<AbortController | null>(null);
  const [draftId] = useState(randomUUID);
  const request = transport?.request ?? requestPublicForm;
  const submissionKey = JSON.stringify([form.id, transport?.scope ?? "anonymous"]);

  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      lifetime.current = null;
      controller.abort();
    };
  }, [transport]);

  return <PublicFormResponse form={form} locale={locale} signedIn={!!transport}
    onLogin={onLogin} onWeb={onWeb} onCheck={onCheck} onDone={onDone} statusCheck={statusCheck} checking={checking} checkFailed={checkFailed}
    onRepeat={() => submissionGate.fillAgain(submissionKey)}
    onSubmit={draft => {
      const local = lifetime.current;
      return local && (!transport || transport.isCurrent())
        ? submissionGate.send(submissionKey, () => submitPublicForm(request, form, draft, local.signal))
        : Promise.resolve({ status: "uncertain" });
    }}
    onUpload={index => {
      const local = lifetime.current;
      const question = form.questions[index];
      if (!local || question?.type !== "FILE_UPLOAD" || (transport && !transport.isCurrent())) return Promise.resolve({ status: "cancelled" });
      // The picker also isolates anonymous temp files with a local per-draft binding. It grants no network access.
      const fileScope = transport ?? {
        scope: { origin: NATIVE_STAGING_ORIGIN, sessionId: draftId, accountId: "anonymous-public-form" },
        signal: local.signal, isCurrent: () => lifetime.current === local && !local.signal.aborted,
      };
      return pickAndUploadFormFile(request, {
        session: fileScope, target: { route, locale, draftId }, signal: local.signal,
        isDraftCurrent: () => lifetime.current === local && !local.signal.aborted, policy: formUploadPolicy(question),
      }, form.id, index);
    }} />;
}
