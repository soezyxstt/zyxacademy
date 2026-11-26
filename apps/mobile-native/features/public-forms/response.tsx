import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { buildFormSteps } from "../../../../packages/forms/presentation";
import { customFormMessage } from "../../../../packages/forms/response-policy";
import { Input } from "../../components/Input";
import { Progress } from "../../components/Progress";
import { NativeStatusPanel, SharedUiActionButton } from "../shared-ui/layout";
import type { FormSubmission } from "./client";
import { publicFormCopy } from "./copy";
import type { PickedFormUpload } from "./expo-client";
import { FormField, formStyles } from "./fields";
import { fieldsOnStep, questionIssue, validFormEmail, type FieldIssue, type FormDraft, type FormLocale, type PublicAnswer, type PublicForm } from "./model";

type ResponseAction = { status: "submit" } | { status: "upload"; index: number };
type FormResponseProps = {
  form: PublicForm;
  locale: FormLocale;
  signedIn: boolean;
  statusCheck?: number;
  checking?: boolean;
  checkFailed?: boolean;
  onSubmit: (draft: FormDraft) => Promise<FormSubmission>;
  onUpload: (index: number) => Promise<PickedFormUpload>;
  onLogin: () => void;
  onWeb: () => void;
  onCheck: () => void;
  onDone: () => void;
  onRepeat?: () => void;
};

const emptyDraft = (): FormDraft => ({ answers: {}, other: {}, email: "" });

export function PublicFormResponse({ form, locale, signedIn, onSubmit, onUpload, onLogin, onWeb, onCheck, onDone, statusCheck, checking, checkFailed, onRepeat }: FormResponseProps) {
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
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<ResponseAction | null>(null);
  const draftRef = useRef(draft);
  const active = useRef(true);
  const occupied = useRef(false);
  const confirming = useRef(false);
  const locked = useRef(false);
  const scroller = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const [focus, setFocus] = useState<{ key: string } | null>(null);
  const { indices, email, cover } = fieldsOnStep(steps[cursor]);
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
    setResult(outcome.status);
    if (["sent", "uncertain", "already-sent", "missing"].includes(outcome.status)) locked.current = true;
    if (outcome.status === "sent") {
      update(emptyDraft());
      setFilenames({});
    }
  }

  function next() {
    if (occupied.current || confirming.current || locked.current || !validate(finalStep)) return;
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

  async function upload(index: number) {
    if (occupied.current || confirming.current || locked.current) return;
    occupied.current = true;
    setPending({ status: "upload", index });
    setUploadErrors(previous => ({ ...previous, [index]: "" }));
    let outcome: PickedFormUpload = { status: "retry" };
    try {
      outcome = await onUpload(index);
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
    } else if (outcome.status !== "cancelled") {
      const message = outcome.status === "type" ? copy.fileWrongType : copy.fileFailed;
      setUploadErrors(previous => ({ ...previous, [index]: message }));
    }
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
  return <View style={styles.response}>
    {steps.length > 1 && <Progress value={cursor} max={steps.length} accessibilityLabel={copy.progress} style={styles.progress} />}
    <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {cover && <View style={formStyles.group}>
        <Text accessibilityRole="header" style={[formStyles.title, { color: colors.foreground }]}>{form.title}</Text>
        {form.description && <Text style={[formStyles.body, { color: colors.mutedForeground }]}>{form.description}</Text>}
      </View>}
      {email && <View style={formStyles.group} onLayout={event => { positions.current.email = event.nativeEvent.layout.y; }}>
        <Text accessibilityRole="header" style={[formStyles.heading, { color: colors.foreground }]}>{copy.emailTitle}</Text>
        <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{copy.emailExplanation}</Text>
        <Input accessibilityLabel={copy.emailTitle} autoComplete="email" autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" placeholder={copy.emailPlaceholder} disabled={disabled}
          value={draft.email} onChangeText={value => { update({ ...draftRef.current, email: value }); setEmailIssue(false); }} style={formStyles.input} />
        {emailIssue && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[formStyles.meta, { color: colors.destructive }]}>{copy.emailInvalid}</Text>}
      </View>}
      {indices.map(index => {
        const question = form.questions[index];
        return <View key={index} onLayout={event => { positions.current[index] = event.nativeEvent.layout.y; }}>
          <FormField index={index} question={question} value={draft.answers[index]} detail={draft.other[index] ?? ""} issue={issues[index]}
            colors={colors} locale={locale} disabled={disabled} onValue={value => updateAnswer(index, value)}
            onDetail={value => update({ ...draftRef.current, other: { ...draftRef.current.other, [index]: value } })}
            file={question.type !== "FILE_UPLOAD" ? undefined : {
              filename: filenames[index], error: uploadErrors[index], pending: pending?.status === "upload" && pending.index === index,
              pick: () => void upload(index), clear: () => {
                updateAnswer(index, undefined);
                setFilenames(previous => { const next = { ...previous }; delete next[index]; return next; });
              },
            }} />
        </View>;
      })}
      {notice}
      {checkFailed && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[formStyles.meta, { color: colors.destructive }]}>{copy.loadError}</Text>}
      <View style={formStyles.row}>
        {cursor > 0 && <SharedUiActionButton action={{ id: "back", label: copy.back, disabled: !!pending, variant: "ghost" }}
          onAction={() => navigate(cursor - 1)} />}
        {!blocked && <SharedUiActionButton
          action={{ id: "next", label: pending?.status === "submit" ? copy.submitting.replace("...", "…")
            : finalStep ? copy.submit : cover && !email && !indices.length ? copy.start : copy.next,
            disabled: disabled || needsCheck, pending: pending?.status === "submit", variant: "default" }}
          onAction={next} testID="public-form-next" />}
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  response: { flex: 1 },
  progress: { marginBottom: 12 },
  content: { gap: 16, paddingBottom: 16 },
});
