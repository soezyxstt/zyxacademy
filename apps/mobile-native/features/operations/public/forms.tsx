import { getDocumentAsync } from "expo-document-picker";
import { useEffect, useRef, useState } from "react";
import { View, type TextInputProps } from "react-native";
import { Checkbox } from "../../../components/Checkbox";
import { Input } from "../../../components/Input";
import { Action, Divider, Hero, Label, layout, type PublicFile, RowLink, usePublic } from "./ui";

const courseOptions = [
  { value: "tpb-kalkulus-1", label: "TPB Kalkulus I" },
  { value: "tpb-fisika-1a", label: "TPB Fisika Dasar IA" },
  { value: "tpb-kimia-1a", label: "TPB Kimia Dasar IA" },
  { value: "if-struktur-data", label: "IF Struktur Data" },
];

const fieldDefinitions = [
  { key: "fullName", label: "Full name", placeholder: "e.g. Adi Haditya Nursyam" },
  { key: "email", label: "Email address", placeholder: "username@email.com", keyboardType: "email-address", autoCapitalize: "none" },
  { key: "age", label: "Age", placeholder: "18", keyboardType: "number-pad" },
  { key: "password", label: "Password", placeholder: "At least 8 characters", autoCapitalize: "none" },
] satisfies Array<{ key: "fullName" | "email" | "age" | "password"; label: string; placeholder: string; keyboardType?: TextInputProps["keyboardType"]; autoCapitalize?: TextInputProps["autoCapitalize"] }>;

const emptyForm = { fullName: "", email: "", password: "", age: "", course: "", agreed: false, files: [] as PublicFile[] };
type FormValues = typeof emptyForm;
type Field = keyof FormValues;
type Errors = Partial<Record<Field, string>>;

const exampleErrors: Errors = {
  fullName: "Full name must be at least 3 characters.",
  email: "Please enter a valid email address.",
  password: "Password must be at least 8 characters.",
  age: "Age must be a number between 15 and 100.",
  course: "Please select a course.",
  files: "Please upload at least 1 document.",
  agreed: "You must agree to the terms to proceed.",
};

function validate(values: FormValues): Errors {
  const errors: Errors = {};
  if (!values.fullName.trim()) errors.fullName = "Full name is required.";
  else if (values.fullName.trim().length < 3) errors.fullName = exampleErrors.fullName;
  if (!values.email.trim()) errors.email = "Email address is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = exampleErrors.email;
  if (!values.password) errors.password = "Password is required.";
  else if (values.password.length < 8) errors.password = exampleErrors.password;
  const age = parseInt(values.age, 10);
  if (!values.age) errors.age = "Age is required.";
  else if (Number.isNaN(age) || age < 15 || age > 100) errors.age = exampleErrors.age;
  if (!values.course) errors.course = exampleErrors.course;
  if (values.files.length === 0) errors.files = exampleErrors.files;
  if (!values.agreed) errors.agreed = exampleErrors.agreed;
  return errors;
}

async function pickFormDocuments() {
  const result = await getDocumentAsync({
    type: ["application/pdf", "image/png"],
    copyToCacheDirectory: false,
    multiple: true,
  });
  if (result.canceled) return null;
  return result.assets.map(({ name, size }) => ({ name, size: size ?? Number.NaN }));
}

export function FormsPlayground() {
  const { colors, theme, pickFiles = pickFormDocuments } = usePublic();
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCourses, setShowCourses] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (submitTimer.current) clearTimeout(submitTimer.current); }, []);

  function change<K extends Field>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function reset() {
    setValues(emptyForm);
    setErrors({});
    setMessage(null);
    setShowPassword(false);
    setShowCourses(false);
  }

  function submit() {
    if (submitTimer.current) return;
    const result = validate(values);
    setErrors(result);
    if (Object.keys(result).length) {
      setMessage({ kind: "error", text: "Form validation failed. Please check the fields." });
      return;
    }
    setMessage(null);
    setBusy(true);
    submitTimer.current = setTimeout(() => {
      submitTimer.current = null;
      setBusy(false);
      reset();
      setMessage({ kind: "success", text: "Profile registration successful." });
    }, 2000);
  }

  async function selectFiles() {
    if (picking) return;
    setPicking(true);
    try {
      const files = await pickFiles();
      if (!files?.length) return;
      const accepted = files.filter(({ name, size }) => /\.(pdf|png)$/i.test(name) && Number.isFinite(size) && size >= 0 && size <= 5 * 1024 * 1024);
      if (accepted.length) change("files", [...values.files, ...accepted]);
      if (accepted.length !== files.length) setErrors((current) => ({ ...current, files: "Choose PDF or PNG files up to 5 MB." }));
    } catch {
      setErrors((current) => ({ ...current, files: "Could not select files. Try again." }));
    } finally {
      setPicking(false);
    }
  }

  return <View style={layout.stack} testID="public-forms-playground">
    <Hero compact centered title="Zyx Form Components Playground" />
    <Divider />
    <Label tone="subheading">Register Profile</Label>
    {fieldDefinitions.map(({ key, label, placeholder, keyboardType, autoCapitalize }) => {
      const error = errors[key];
      return <View style={layout.item} key={key}>
        <Label style={{ fontWeight: "600" }}>{label}</Label>
        <View style={layout.inline}>
          <Input
            theme={theme} testID={`public-form-${key}`} accessibilityLabel={label} accessibilityHint={error}
            value={values[key]} onChangeText={(text) => change(key, text)} keyboardType={keyboardType}
            autoCapitalize={autoCapitalize} placeholder={placeholder} disabled={busy} secureTextEntry={key === "password" && !showPassword}
            style={{ flex: 1, minHeight: 44, borderColor: error ? colors.destructive : colors.input }}
          />
          {key === "password" && <Action onPress={() => setShowPassword(!showPassword)} disabled={busy}>{showPassword ? "Hide" : "Show"}</Action>}
        </View>
        {!!error && <Label tone="error" live="polite">{error}</Label>}
      </View>;
    })}
    <View style={layout.item}>
      <Label style={{ fontWeight: "600" }}>Select course</Label>
      <Action onPress={() => setShowCourses(!showCourses)} disabled={busy}>{courseOptions.find((item) => item.value === values.course)?.label ?? "Select subject"}</Action>
      {showCourses && courseOptions.map((option) => <RowLink key={option.value} active={values.course === option.value} role="button"
        onPress={() => { change("course", option.value); setShowCourses(false); }}>
        <Label>{option.label}</Label>
      </RowLink>)}
      {!!errors.course && <Label tone="error" live="polite">{errors.course}</Label>}
    </View>
    <View style={layout.item}>
      <Label style={{ fontWeight: "600" }}>Upload assignment</Label>
      <Label tone="meta">PDF or PNG files, up to 5 MB each.</Label>
      <Action onPress={() => void selectFiles()} disabled={busy} loading={picking}>Choose files</Action>
      {values.files.map((file, index) => <View key={`${file.name}-${index}`} style={layout.between}>
        <Label>{file.name}</Label>
        <Action accessibilityLabel={`Remove ${file.name}`} variant="ghost" disabled={busy}
          onPress={() => change("files", values.files.filter((_, i) => i !== index))}>Remove</Action>
      </View>)}
      {!!errors.files && <Label tone="error" live="polite">{errors.files}</Label>}
    </View>
    <View style={layout.item}>
      <View style={layout.inline}>
        <Checkbox testID="public-form-agreement" checked={values.agreed} disabled={busy} theme={theme}
          accessibilityLabel="Agree to the terms and rules of Zyx Academy"
          onCheckedChange={(checked) => change("agreed", checked === true)} />
        <Label style={{ flex: 1 }}>Agree to the terms and rules of Zyx Academy</Label>
      </View>
      {!!errors.agreed && <Label tone="error" live="polite">{errors.agreed}</Label>}
    </View>
    {!!message && <Label tone={message.kind === "error" ? "error" : "link"} live={message.kind === "error" ? "assertive" : "polite"}>{message.text}</Label>}
    <View style={layout.row}>
      <Action onPress={submit} id="public-form-submit" loading={busy} disabled={picking} variant="default">Register Profile</Action>
      <Action onPress={reset} disabled={busy || picking}>Reset</Action>
      <Action onPress={() => { setErrors(exampleErrors); setMessage({ kind: "error", text: "Mock validation errors activated." }); }} disabled={busy}>Trigger validation errors</Action>
    </View>
  </View>;
}
