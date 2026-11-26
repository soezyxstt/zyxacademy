import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { authLocale } from "../../auth/auth-copy";
import { authEntryHref } from "../../auth/login-intent";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import type { NativeSessionScope } from "../../network/transport";
import { createFormSubmissionGate, loadPublicForm, submitPublicForm } from "./client";
import { pickAndUploadFormFile, requestPublicForm } from "./expo-client";
import { formIdentifier, formUploadPolicy, publicFormPath, type FormEntry, type FormLocale, type PublicForm, type PublicFormLoad } from "./model";
import { PublicFormResponse } from "./response";
import { PublicFormScreen } from "./screen";
import { formDraftOwner, formWriteAccess, recoverFormWriteSession } from "./session";

type WebStatus = "idle" | "opening" | "error";

export function PublicFormRoute({ entry, identifier: raw, requestedLocale }: { entry: FormEntry; identifier: unknown; requestedLocale?: string }) {
  const id = formIdentifier(raw);
  const { context } = useNativeAccountContext();
  const locale: FormLocale = context?.locale ?? authLocale(requestedLocale);
  return <PublicFormLocation key={JSON.stringify([entry, id])} entry={entry} id={id} locale={locale} />;
}

function PublicFormLocation({ id, entry, locale }: { id: string | null; entry: FormEntry; locale: FormLocale }) {
  const session = useNativeSession();
  const { state, refresh } = session;
  const router = useRouter();
  const [data, setData] = useState<PublicFormLoad | null>(id ? null : { status: "missing" });
  const [web, setWeb] = useState<WebStatus>("idle");
  const [statusCheck, setStatusCheck] = useState(0);
  const [submissionGate] = useState(createFormSubmissionGate);
  const [previousOwner, setPreviousOwner] = useState<NativeSessionScope | "anonymous" | null>(null);
  const owner = formDraftOwner(session, previousOwner);
  if (owner !== previousOwner) setPreviousOwner(owner);
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
    if (route && session.getSnapshot().state.status === "signed-out") {
      router.push(authEntryHref({ entry: "sign-in", locale, next: route }));
    }
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
  const access = state.status === "loading" || session.revalidating ? "waiting"
    : state.status === "signed-out" ? "anonymous" : formWriteAccess(session, owner) ? "signed-in" : "unavailable";
  const form = data?.status === "ready" ? data.form : null;
  const formKey = JSON.stringify([owner, form]);

  return <PublicFormScreen state={data} locale={locale} access={access} opening={web === "opening"} browserFailed={web === "error"}
    onRetry={tryAgain} onLogin={login} onWeb={openWeb} onMeet={() => void open(data?.status === "meeting" ? data.url : null)}
    onBack={leave} onHome={() => router.replace("/")}>
    {form && route && owner && (
      <FormSession key={formKey}
        locale={locale} route={route} form={form} owner={owner} session={session} access={access}
        onLogin={login} onWeb={openWeb} onCheck={() => load(true)} statusCheck={statusCheck}
        onUploadWeb={() => void open(NATIVE_STAGING_ORIGIN + publicFormPath("full", form.id))}
        checking={checking} checkFailed={checkFailed} onDone={leave} submissionGate={submissionGate} />
    )}
  </PublicFormScreen>;
}

function FormSession({ form, locale, route, owner, session, access, onLogin, onWeb, onUploadWeb, onCheck, onDone, statusCheck, checking, checkFailed, submissionGate }: {
  form: PublicForm; locale: FormLocale; route: string; owner: NativeSessionScope | "anonymous";
  session: ReturnType<typeof useNativeSession>; access: "waiting" | "unavailable" | "signed-in" | "anonymous";
  onLogin(): void; onWeb(): void; onUploadWeb(): void; onCheck(): void; onDone(): void; statusCheck: number; checking: boolean; checkFailed: boolean;
  submissionGate: ReturnType<typeof createFormSubmissionGate>;
}) {
  const lifetime = useRef<AbortController | null>(null);
  const [draftId] = useState(randomUUID);
  const submissionKey = JSON.stringify([form.id, owner]);

  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      lifetime.current = null;
      controller.abort();
    };
  }, []);

  const isDraftCurrent = (local: AbortController) => !local.signal.aborted
    && formDraftOwner(session.getSnapshot(), owner) === owner;
  const recover = (signal: AbortSignal) => owner === "anonymous"
    ? { status: "session-pending" as const } : recoverFormWriteSession(session, owner, signal);

  return <PublicFormResponse form={form} locale={locale} signedIn={owner !== "anonymous"}
    sessionStatus={access === "waiting" || access === "unavailable" ? access : undefined}
    onSessionRetry={() => void session.refresh()} onUploadWeb={onUploadWeb}
    onLogin={onLogin} onWeb={onWeb} onCheck={onCheck} onDone={onDone} statusCheck={statusCheck} checking={checking} checkFailed={checkFailed}
    onRepeat={() => submissionGate.fillAgain(submissionKey)}
    onSubmit={async draft => {
      const local = lifetime.current;
      const current = formWriteAccess(session.getSnapshot(), owner);
      if (!local || !current) return { status: "session-pending" };
      const request = current === "anonymous" ? requestPublicForm : current.request;
      const identity = current === "anonymous" ? undefined : current.scope;
      const result = await submissionGate.send(submissionKey, async () => {
        if (local.signal.aborted || formWriteAccess(session.getSnapshot(), owner) !== current) {
          return { status: "session-pending" };
        }
        const outcome = await submitPublicForm(request, form, draft, local.signal, identity);
        return outcome.status === "credential-rejected" ? recover(local.signal) : outcome;
      });
      return isDraftCurrent(local) ? result : { status: "session-pending" };
    }}
    onUpload={async index => {
      const local = lifetime.current;
      const question = form.questions[index];
      const current = formWriteAccess(session.getSnapshot(), owner);
      if (!local || !current || question?.type !== "FILE_UPLOAD") return { status: "cancelled" };
      const isUploadCurrent = () => isDraftCurrent(local);
      const policy = formUploadPolicy(question);
      const result = await pickAndUploadFormFile(async () => {
        // The system picker can return before the foreground refresh notification reaches React.
        if (owner !== "anonymous") await session.refresh();
        if (!isUploadCurrent()) return null;
        const verified = formWriteAccess(session.getSnapshot(), owner);
        if (!verified) return null;
        return verified === "anonymous" ? { request: requestPublicForm }
          : { request: verified.request, identity: verified.scope };
      }, {
        // The draft stays alive while credentials are being checked. Every write uses current credentials.
        session: {
          scope: owner === "anonymous" ? { origin: NATIVE_STAGING_ORIGIN, sessionId: draftId, accountId: "anonymous-public-form" } : owner,
          signal: local.signal, isCurrent: isUploadCurrent,
        },
        signal: local.signal, target: { route, locale, draftId }, isDraftCurrent: isUploadCurrent, policy,
      }, form.id, index);
      const outcome = result.status === "credential-rejected" ? await recover(local.signal) : result;
      return isUploadCurrent() ? outcome : { status: "cancelled" };
    }} />;
}
