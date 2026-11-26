import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { buildFormSteps, formQuestionNumbers } from "../../../../packages/forms/presentation";
import { customFormMessage } from "../../../../packages/forms/response-policy";
import { Input } from "../../components/Input";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import Svg, { Path } from "react-native-svg";
import { hapticError, hapticSuccess } from "../../device/haptics";
import { NativeStatusPanel, SharedUiActionButton } from "../shared-ui/layout";
import type { FormSubmission } from "./client";
import { publicFormCopy } from "./copy";
import type { FormUploadSource, PickedFormUpload } from "./expo-client";
import { FormField, formStyles } from "./fields";
import { fieldsOnStep, questionIssue, validFormEmail, type FieldIssue, type FormDraft, type FormLocale, type PublicAnswer, type PublicForm } from "./model";

type ResponseAction = { status: "submit" } | { status: "upload"; index: number };
type UploadFeedback = { message: string; settings?: boolean };
type FormResponseProps = {
  form: PublicForm;
  locale: FormLocale;
  signedIn: boolean;
  sessionStatus?: "waiting" | "unavailable";
  onSessionRetry?: () => void;
  onUploadWeb?: () => void;
  cameraAvailable?: boolean;
  statusCheck?: number;
  checking?: boolean;
  checkFailed?: boolean;
  onSubmit: (draft: FormDraft) => Promise<FormSubmission>;
  onUpload: (index: number, source: FormUploadSource) => Promise<PickedFormUpload>;
  onLogin: () => void;
  onWeb: () => void;
  onCheck: () => void;
  onDone: () => void;
  onRepeat?: () => void;
};

const emptyDraft = (): FormDraft => ({ answers: {}, other: {}, email: "" });

export function PublicFormResponse({ form, locale, signedIn, sessionStatus, onSessionRetry, onUploadWeb, cameraAvailable, onSubmit, onUpload, onLogin, onWeb, onCheck, onDone, statusCheck, checking, checkFailed, onRepeat }: FormResponseProps) {
  const colors = nativeColors[useColorScheme() ?? "light"];
  const copy = publicFormCopy(locale);
  const needsEmail = form.settings.collectEmail === "input";
  const steps = useMemo(() => buildFormSteps(form.questions, form.settings.displayMode, needsEmail),
    [form.questions, form.settings.displayMode, needsEmail]);
  const [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [result, setResult] = useState<FormSubmission["status"] | null>(null);
  const [issues, setIssues] = useState<Record<number, FieldIssue>>({});
  const [emailIssue, setEmailIssue] = useState(false);
  const [filenames, setFilenames] = useState<Record<number, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<number, UploadFeedback>>>({});
  const [pending, setPending] = useState<ResponseAction | null>(null);
  const draftRef = useRef(draft);
  const active = useRef(true);
  const occupied = useRef(false);
  const confirming = useRef(false);
  const locked = useRef(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Record<string, number>>({});
  const [focus, setFocus] = useState<{ key: string } | null>(null);
  const step = steps[cursor];
  const { indices, email, cover } = fieldsOnStep(step);
  const numbers = useMemo(() => formQuestionNumbers(form.questions), [form.questions]);
  const percent = Math.round(cursor / steps.length * 100);
  const section = step?.kind === "page";
  const finalStep = cursor === steps.length - 1;
  const blocked = result === "uncertain" || result === "already-sent" || result === "missing";
  const needsCheck = result === "denied" || result === "invalid";

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => scroller.current?.scrollTo({
      y: focus ? Math.max(0, (positions.current[focus.key] ?? 0) - 12) : 0, animated: false,
    }));
    return () => cancelAnimationFrame(frame);
  }, [cursor, focus]);

  useEffect(() => {
    setResult(previous => previous === "denied" || previous === "invalid" ? null : previous);
  }, [statusCheck]);

  function update(next: FormDraft) {
    draftRef.current = next;
    setDraft(next);
  }

  function updateAnswer(index: number, value: PublicAnswer | undefined) {
    const answers = { ...draftRef.current.answers };
    const other = { ...draftRef.current.other };
    if (value === undefined) {
      delete answers[index];
      delete other[index];
    } else {
      answers[index] = value;
    }
    update({ ...draftRef.current, answers, other });
    setIssues(previous => {
      const next = { ...previous };
      delete next[index];
      return next;
    });
  }

  function navigate(next: number, field?: string) {
    if (next !== cursor) positions.current = {};
    setCursor(next);
    setFocus(field ? { key: field } : null);
  }

  function validate(all: boolean) {
    const next: Record<number, FieldIssue> = {};
    const current = draftRef.current;
    const selection = all ? form.questions.map((_, index) => index) : indices;
    for (const index of selection) {
      const issue = questionIssue(form.questions[index], current.answers[index], current.other[index] ?? "");
      if (issue) next[index] = issue;
    }
    setIssues(next);
    const badEmail = (all ? needsEmail : email) && !validFormEmail(current.email);
    setEmailIssue(badEmail);
    const first = Object.keys(next)[0];
    if (!badEmail && first === undefined) return true;
    const target = badEmail ? "email" : first!;
    const targetStep = steps.findIndex(step => {
      const fields = fieldsOnStep(step);
      return badEmail ? fields.email : fields.indices.includes(Number(first));
    });
    navigate(Math.max(0, targetStep), target);
    return false;
  }

  async function submit() {
    if (occupied.current || locked.current || !active.current) return;
    occupied.current = true;
    setPending({ status: "submit" });
    setResult(null);
    let outcome: FormSubmission = { status: "uncertain" };
    try {
      outcome = await onSubmit(draftRef.current);
    } catch { /* A network failure after dispatch cannot confirm whether the form received the response. */ }
    occupied.current = false;
    if (!active.current) return;
    setPending(null);
    setResult(outcome.status === "session-pending" ? null : outcome.status);
    if (["sent", "uncertain", "already-sent", "missing"].includes(outcome.status)) locked.current = true;
    if (outcome.status === "sent") {
      void hapticSuccess();
      update(emptyDraft());
      setFilenames({});
    } else if (outcome.status === "denied" || outcome.status === "invalid" || outcome.status === "missing") {
      void hapticError();
    }
  }

  function next() {
    if (occupied.current || confirming.current || locked.current || (finalStep && sessionStatus) || !validate(finalStep)) return;
    if (!finalStep) {
      navigate(cursor + 1);
      return;
    }
    confirming.current = true;
    const close = () => { confirming.current = false; };
    Alert.alert(copy.confirmTitle, undefined, [
      { text: copy.keepEditing, style: "cancel", onPress: close },
      { text: copy.submit, onPress: () => { close(); void submit(); } },
    ], { cancelable: true, onDismiss: close });
  }

  async function upload(index: number, source: FormUploadSource) {
    if (occupied.current || confirming.current || locked.current || sessionStatus) return;
    occupied.current = true;
    setPending({ status: "upload", index });
    setUploadErrors(previous => ({ ...previous, [index]: undefined }));
    let outcome: PickedFormUpload = { status: "retry" };
    try {
      outcome = await onUpload(index, source);
    } catch { /* Use a fixed message without the temporary provider URI. */ }
    occupied.current = false;
    if (!active.current) return;
    setPending(null);
    if (outcome.status === "uploaded") {
      updateAnswer(index, outcome.storageUrl);
      setFilenames(previous => ({ ...previous, [index]: outcome.filename }));
    } else if (outcome.status === "login" || outcome.status === "verify-email" || outcome.status === "denied" || outcome.status === "missing") {
      if (outcome.status === "missing") locked.current = true;
      setResult(outcome.status);
    } else if (outcome.status === "camera-denied") {
      const settings = !outcome.canAskAgain;
      setUploadErrors(previous => ({ ...previous, [index]: { message: settings ? copy.cameraSettings : copy.cameraPermission, settings } }));
    } else if (outcome.status !== "cancelled" && outcome.status !== "session-pending") {
      const message = outcome.status === "session-retry" ? copy.uploadSessionRejected
        : outcome.status === "type" ? copy.fileWrongType : outcome.status === "size" ? copy.fileTooLarge : copy.fileFailed;
      setUploadErrors(previous => ({ ...previous, [index]: { message } }));
    }
  }

  function openCameraSettings(index: number) {
    void Linking.openSettings().catch(() => {
      if (active.current) setUploadErrors(previous => previous[index]?.settings
        ? { ...previous, [index]: { message: copy.cameraSettingsFailed, settings: true } } : previous);
    });
  }

  function again() {
    onRepeat?.();
    locked.current = false;
    setResult(null);
    setIssues({});
    setEmailIssue(false);
    setUploadErrors({});
    navigate(0);
  }

  if (result === "sent") return <View style={styles.content}>
    <NativeStatusPanel title={copy.saved}
      message={customFormMessage("customSuccessMessage", form.settings.customSuccessMessage) || copy.submitSuccess}
      action={{ id: "done", label: copy.done }} onAction={onDone} />
    {!(signedIn && form.settings.limitToOneResponse) && <SharedUiActionButton
      action={{ id: "again", label: copy.fillAgain, variant: "ghost" }} onAction={again} />}
  </View>;

  const notice = (() => {
    switch (result) {
      case "uncertain": return <NativeStatusPanel tone="error" title={copy.uncertain} />;
      case "already-sent": return <NativeStatusPanel title={copy.alreadySent} />;
      case "missing": return <NativeStatusPanel title={copy.notFoundTitle} message={copy.notFoundDescription} />;
      case "login": return <NativeStatusPanel tone="error" title={copy.loginRequired} message={copy.loginDescription}
        action={{ id: "login", label: copy.loginAction }} onAction={onLogin} />;
      case "session-retry": return sessionStatus ? null : <NativeStatusPanel tone="error" title={copy.submitSessionRejected} />;
      case "verify-email": return <NativeStatusPanel tone="error" title={copy.verifiedEmail}
        action={{ id: "web", label: copy.openWeb }} onAction={onWeb} />;
      case "denied": return <NativeStatusPanel tone="error" title={copy.denied}
        action={{ id: "check", label: copy.checkStatus, pending: checking }} onAction={onCheck} />;
      case "invalid": return <NativeStatusPanel tone="error" title={copy.submitFailed}
        action={{ id: "check", label: copy.checkStatus, pending: checking }} onAction={onCheck} />;
      default: return null;
    }
  })();

  const disabled = !!pending || blocked || !!checking;
  const advanceLabel = finalStep ? copy.submit : cover && !email && !indices.length ? copy.start : copy.next;
  const controls = <View style={[styles.actions, { borderTopColor: colors.border + "99" }]}>
    {(section || cursor > 0) && <Button variant={section ? "outline" : "ghost"}
      disabled={cursor === 0 || !!pending} onPress={() => navigate(cursor - 1)}>{copy.back}</Button>}
    {!blocked && <Button testID="public-form-next" onPress={next} isLoading={pending?.status === "submit"}
      accessibilityLabel={advanceLabel} disabled={disabled || needsCheck || (finalStep && !!sessionStatus)}
      iconPosition="end" renderIcon={(color, size) => <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
        <Path d={finalStep ? "M22 2 15 22l-4-9-9-4 20-7ZM22 2 11 13" : "M5 12h14m-7-7 7 7-7 7"}
          stroke={color} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>}>{pending?.status === "submit" ? copy.submitting : advanceLabel}</Button>}
  </View>;
  return <View style={styles.response}>
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border + "66", backgroundColor: colors.background + "d9" }}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel={copy.progress}
        accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ height: 4, backgroundColor: colors.muted + "99" }}>
        <View style={{ width: `${percent}%`, height: 4, backgroundColor: colors.brandPrimary }} />
      </View>
      <View style={[styles.column, styles.header]}>
        <Text numberOfLines={1} style={[formStyles.meta, nativeTypography.bodyMedium, { flex: 1, color: colors.foreground }]}>{form.title}</Text>
        {section && <Text style={[formStyles.meta, nativeTypography.bodySemibold, { color: colors.mutedForeground }]}>
          {locale === "id" ? "Bagian" : "Section"} {cursor + 1} / {steps.length}
        </Text>}
        {step?.kind === "question" && <Text style={[styles.counter, { color: colors.mutedForeground }]}>{numbers.get(step.questionIndex)} / {numbers.size}</Text>}
        <Text style={[styles.counter, { fontWeight: "700", color: colors.brandPrimary }]}>{percent}%</Text>
      </View>
    </View>
    <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.column, styles.content]}>
      {cover && <View style={styles.cover}>
        <Text accessibilityRole="header" style={[formStyles.title, { letterSpacing: -0.6, color: colors.foreground }]}>{form.title}</Text>
        {form.description && <Text style={[styles.description, { color: colors.mutedForeground }]}>{form.description}</Text>}
      </View>}
      {email && <View style={formStyles.group} onLayout={event => { positions.current.email = event.nativeEvent.layout.y; }}>
        <Text accessibilityRole="header" style={[formStyles.heading, { color: colors.foreground }]}>{copy.emailTitle}</Text>
        <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{copy.emailExplanation}</Text>
        <Input accessibilityLabel={copy.emailTitle} autoComplete="email" autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" placeholder={copy.emailPlaceholder} disabled={disabled}
          value={draft.email} onChangeText={value => { update({ ...draftRef.current, email: value }); setEmailIssue(false); }} style={formStyles.input} />
        {emailIssue && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[formStyles.meta, { color: colors.destructive }]}>{copy.emailInvalid}</Text>}
      </View>}
      {indices.map((index, position) => {
        const question = form.questions[index];
        return <View key={index} style={section && (cover || email || position > 0) && [styles.divider, { borderTopColor: colors.border + "b3" }]}
          onLayout={event => { positions.current[index] = event.nativeEvent.layout.y; }}>
          <FormField index={index} number={numbers.get(index)} question={question} value={draft.answers[index]} detail={draft.other[index] ?? ""} issue={issues[index]}
            colors={colors} locale={locale} disabled={disabled} onValue={value => updateAnswer(index, value)}
            onDetail={value => update({ ...draftRef.current, other: { ...draftRef.current.other, [index]: value } })}
            file={question.type !== "FILE_UPLOAD" ? undefined : {
              filename: filenames[index], error: uploadErrors[index]?.message, pending: pending?.status === "upload" && pending.index === index,
              pick: () => void upload(index, "document"), capture: cameraAvailable ? () => void upload(index, "camera") : undefined,
              openSettings: uploadErrors[index]?.settings ? () => openCameraSettings(index) : undefined,
              blocked: !!sessionStatus, openWeb: onUploadWeb, clear: () => {
                updateAnswer(index, undefined);
                setFilenames(previous => { const next = { ...previous }; delete next[index]; return next; });
              },
            }} />
        </View>;
      })}
      {notice}
      {sessionStatus === "waiting" && <Text accessibilityLiveRegion="polite"
        style={[formStyles.meta, { color: colors.mutedForeground }]}>{copy.sessionChecking}</Text>}
      {sessionStatus === "unavailable" && <NativeStatusPanel tone="error" title={copy.sessionUnavailable}
        action={{ id: "session", label: copy.retry }} onAction={onSessionRetry ?? onCheck} />}
      {checkFailed && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[formStyles.meta, { color: colors.destructive }]}>{copy.loadError}</Text>}
      {(section || step?.kind !== "question") && controls}
    </ScrollView>
    {!section && step?.kind === "question" && <View style={[styles.column, styles.footer, { backgroundColor: colors.background }]}>{controls}</View>}
  </View>;
}

const styles = StyleSheet.create({
  response: { flex: 1 },
  column: { alignSelf: "center", width: "100%", maxWidth: 672, paddingHorizontal: 16 },
  header: { flexDirection: "row", minHeight: 44, alignItems: "center", columnGap: 8 },
  counter: { ...nativeTypography.mono, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
  content: { gap: 16, paddingVertical: 16 },
  cover: { gap: 16 },
  description: { ...nativeTypography.bodyRegular, fontSize: 16, lineHeight: 26 },
  divider: { borderTopWidth: 1, paddingTop: 20, marginTop: 4, paddingBottom: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTopWidth: 1, paddingTop: 12 },
  footer: { paddingBottom: 8 },
});
