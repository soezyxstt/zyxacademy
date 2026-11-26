import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { formScaleValues } from "../../../../packages/forms/presentation";
import { formFileAccept } from "../../../../packages/forms/file-types";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";
import { Input, Textarea } from "../../components/Input";
import { SharedUiActionButton } from "../shared-ui/layout";
import { nativeTypography } from "../../typography";
import { fieldIssueMessage, publicFormCopy } from "./copy";
import { formUploadPolicy, isOtherAnswer, otherOption, type FieldIssue, type FormLocale, type PublicAnswer, type PublicQuestion } from "./model";

export const formStyles = StyleSheet.create({
  group: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 30 },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 22 },
  body: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 16 },
  input: { minHeight: 44 },
});

type FormColors = (typeof nativeColors)[keyof typeof nativeColors];

function inclusiveToggle(current: string[], value: string) {
  return current.includes(value) ? current.filter(item => item !== value) : [...current, value];
}

function Choice({ label, accessibilityLabel, selected, multiple, onPress, disabled }: {
  label: string; accessibilityLabel?: string; selected: boolean; multiple?: boolean; onPress: () => void; disabled: boolean;
}) {
  const colors = nativeColors[useColorScheme() ?? "light"];
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.choice, {
        borderColor: focused ? colors.accent : colors.border,
        backgroundColor: selected || pressed ? colors.muted : colors.background,
      }]}
    >
      <View style={[styles.choiceMark, multiple && styles.square, { borderColor: selected ? colors.primary : colors.input }]}>
        {selected && <View style={[styles.choiceFill, multiple && styles.squareFill, { backgroundColor: colors.primary }]} />}
      </View>
      <Text style={[formStyles.body, styles.choiceText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function Dropdown({ options, value, onValue, disabled, locale, title, colors }: {
  options: readonly string[]; value: string; onValue: (value: string) => void; disabled: boolean;
  locale: FormLocale; title: string; colors: FormColors;
}) {
  const [open, setOpen] = useState(false);
  const copy = publicFormCopy(locale);
  const close = () => setOpen(false);
  return <>
    <SharedUiActionButton action={{ id: "select", label: value || copy.dropdownPlaceholder, accessibilityLabel: value ? `${title}, ${value}` : title, disabled }}
      onAction={() => setOpen(true)} />
    <Modal visible={open} transparent animationType="none" onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={[styles.modal, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[formStyles.heading, { color: colors.foreground }]}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalChoices}>
            <View style={formStyles.group}>
              {options.map((option, index) => <Choice key={index} label={option} selected={option === value} disabled={disabled}
                onPress={() => { onValue(option); close(); }} />)}
            </View>
          </ScrollView>
          <SharedUiActionButton action={{ id: "close", label: copy.done, variant: "ghost" }} onAction={close} />
        </View>
      </View>
    </Modal>
  </>;
}

function TemporalField({ kind, title, value, onValue, disabled, locale, colors }: {
  kind: "DATE" | "TIME"; title: string; value: string; onValue: (value: string) => void;
  disabled: boolean; locale: FormLocale; colors: FormColors;
}) {
  const copy = publicFormCopy(locale);
  const isDate = kind === "DATE";
  const separator = isDate ? "-" : ":";
  const parts = value.split(separator);
  const segments = isDate
    ? [{ label: copy.day, index: 2, limit: 2 }, { label: copy.month, index: 1, limit: 2 }, { label: copy.year, index: 0, limit: 4 }]
    : [{ label: copy.hour, index: 0, limit: 2 }, { label: copy.minute, index: 1, limit: 2 }];
  return <View style={formStyles.group}>
    <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{isDate ? copy.dateFormat : copy.timeFormat}</Text>
    <View style={formStyles.row}>{segments.map(({ label, index, limit }) => (
      <View key={index} style={styles.segment}>
        <Text style={[formStyles.meta, { color: colors.foreground }]}>{label}</Text>
        <Input autoComplete="off" accessibilityLabel={`${title}, ${label}`} disabled={disabled} inputMode="numeric" maxLength={limit}
          value={parts[index] ?? ""} style={formStyles.input}
          onChangeText={text => {
            const next = Array.from({ length: segments.length }, (_, position) =>
              position === index ? text.replace(/\D/g, "") : parts[position] ?? "");
            onValue(next.join(separator));
          }} />
      </View>
    ))}</View>
  </View>;
}

function sourceUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value, NATIVE_STAGING_ORIGIN);
    return url.protocol === "https:" && !url.username && !url.password && (value.startsWith("https://")
      || (url.origin === NATIVE_STAGING_ORIGIN && url.pathname.startsWith("/api/storage/"))) ? url.href : null;
  } catch {
    return null;
  }
}

function QuestionImage({ uri, title, failure, colors }: { uri: string; title: string; failure: string; colors: FormColors }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{failure}</Text>;
  return <Image accessibilityLabel={title} accessibilityRole="image" source={{ uri }} style={styles.image} resizeMode="contain" onError={() => setFailed(true)} />;
}

type FileField = {
  blocked?: boolean;
  openWeb?: () => void;
  filename?: string;
  pending: boolean;
  error?: string;
  pick(): void;
  clear(): void;
};

export function FormField({ index, question, value, detail, issue, onValue, onDetail, disabled, locale, file, colors }: {
  index: number; question: PublicQuestion; value?: PublicAnswer; detail: string; issue?: FieldIssue; onValue: (value: PublicAnswer | undefined) => void;
  onDetail: (detail: string) => void; disabled: boolean; locale: FormLocale; file?: FileField; colors: FormColors;
}) {
  const copy = publicFormCopy(locale);
  const type = question.type;
  const readOnly = type === "SECTION" || type === "STATEMENT";
  const image = sourceUrl(question.imageUrl);
  const title = question.title || (type === "SECTION" ? copy.sectionFallback : type === "STATEMENT" ? copy.information : "");
  const scalar = typeof value === "string" ? value : "";
  const selected = Array.isArray(value) ? value : [];
  const options = question.options ?? [];
  let control;
  if (type === "TEXT" || type === "PARAGRAPH") {
    const TextField = type === "TEXT" ? Input : Textarea;
    control = <TextField accessibilityLabel={question.title} disabled={disabled} maxLength={50_000} value={scalar} testID={`public-form-field-${index}`}
      style={formStyles.input} onChangeText={onValue} />;
  } else if (type === "CHECKBOX" || type === "RADIO") {
    const multiple = type === "CHECKBOX";
    const choices = question.otherOption?.enabled ? [...options, otherOption] : options;
    control = <View accessibilityRole={multiple ? undefined : "radiogroup"} style={formStyles.group}>
      {choices.map((option, index) => (
        <Choice key={index} label={option === otherOption ? question.otherOption?.label || copy.other : option} multiple={multiple}
          selected={multiple ? selected.includes(option) : scalar === option} disabled={disabled}
          onPress={() => onValue(multiple ? inclusiveToggle(selected, option) : option)} />
      ))}
      {isOtherAnswer(value) && <Input accessibilityLabel={copy.other} disabled={disabled} value={detail}
        onChangeText={onDetail} style={formStyles.input} placeholder={copy.otherDetailPlaceholder} />}
    </View>;
  } else if (type === "DROP_DOWN") {
    control = <Dropdown options={options} value={scalar} onValue={onValue} disabled={disabled} locale={locale} colors={colors} title={question.title} />;
  } else if (type === "DATE" || type === "TIME") {
    control = <TemporalField kind={type} title={question.title} value={scalar} onValue={onValue} disabled={disabled} locale={locale} colors={colors} />;
  } else if (type === "SCALE" || type === "RATING") {
    control = <View style={formStyles.group}>
      {type === "SCALE" && <View style={formStyles.row}>
        <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{question.scaleLowLabel || copy.scaleLow}</Text>
        <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{question.scaleHighLabel || copy.scaleHigh}</Text>
      </View>}
      <View style={formStyles.row}>{formScaleValues(type === "SCALE" ? question : {}).map(rating => {
        const key = String(rating);
        return <Choice key={key} label={key} accessibilityLabel={type === "RATING" ? copy.starRating.replace("{rating}", key) : undefined}
          selected={scalar === key} disabled={disabled} onPress={() => onValue(key)} />;
      })}</View>
    </View>;
  } else if (type === "GRID_RADIO" || type === "GRID_CHECKBOX") {
    const grid = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const multiple = type === "GRID_CHECKBOX";
    control = <View style={formStyles.group}>{(question.gridRows ?? []).map((row, rowIndex) => {
      const answer = grid[row];
      const marked = Array.isArray(answer) ? answer : [];
      return <View key={rowIndex} style={formStyles.group}>
        <Text accessibilityRole="header" style={[formStyles.body, nativeTypography.bodySemibold, { color: colors.foreground }]}>{row}</Text>
        {(question.gridColumns ?? []).map((column, index) => <Choice key={index} label={column} multiple={multiple} disabled={disabled}
          selected={multiple ? marked.includes(column) : answer === column}
          onPress={() => onValue({ ...grid, [row]: multiple ? inclusiveToggle(marked, column) : column })} />)}
      </View>;
    })}</View>;
  } else if (type === "FILE_UPLOAD" && file) {
    const policy = formUploadPolicy(question);
    const formats = formFileAccept(question.allowedFileTypes).split(",").filter(Boolean).join(", ");
    const maximum = new Intl.NumberFormat(locale).format(policy.maxMb);
    control = <View style={formStyles.group}>
      <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{copy.maxSize} {maximum} MB{formats ? ` · ${formats}` : ""}</Text>
      {file.filename && <Text style={[formStyles.body, { color: colors.foreground }]}>{file.filename}</Text>}
      <View style={formStyles.row}>
        <SharedUiActionButton
          action={{ id: "choose", label: file.pending ? copy.uploading : file.filename ? copy.replaceFile : copy.chooseFile, pending: file.pending, disabled: disabled || file.blocked }}
          onAction={file.pick} />
        {file.filename && <SharedUiActionButton action={{ id: "remove", label: copy.removeFile, disabled, variant: "ghost" }} onAction={file.clear} />}
      </View>
      {file.openWeb && policy.authoredMaxMb > policy.maxMb && <>
        <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{copy.largerUpload.replace("{maximum}",
          new Intl.NumberFormat(locale).format(policy.authoredMaxMb))}</Text>
        <SharedUiActionButton action={{ id: "upload-web", label: copy.openWeb, variant: "ghost" }} onAction={file.openWeb} />
      </>}
      {file.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[formStyles.meta, { color: colors.destructive }]}>{file.error}</Text>}
    </View>;
  }

  return <View style={formStyles.group}>
    <Text accessibilityRole="header" style={[formStyles.heading, { color: colors.foreground }]}>{title}</Text>
    {!readOnly && question.required && <Text style={[formStyles.meta, { color: colors.mutedForeground }]}>{copy.required}</Text>}
    {Boolean(question.description) && <Text style={[formStyles.body, { color: colors.mutedForeground }]}>{question.description}</Text>}
    {image && <QuestionImage key={image} uri={image} title={question.title} failure={copy.mediaFailed} colors={colors} />}
    {control}
    {issue && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[formStyles.meta, { color: colors.destructive }]}>{fieldIssueMessage(locale, issue)}</Text>}
    {!readOnly && type !== "FILE_UPLOAD" && value !== undefined && <View style={styles.clear}>
      <SharedUiActionButton action={{ id: "clear", label: copy.clear, disabled, variant: "ghost" }} onAction={() => onValue(undefined)} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  choice: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderWidth: 1, borderRadius: nativeRadii.md },
  choiceText: { flexShrink: 1 },
  choiceMark: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  choiceFill: { width: 8, height: 8, borderRadius: 4 },
  square: { borderRadius: 4 },
  squareFill: { borderRadius: 2 },
  modalBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "#00000066" },
  modal: { width: "100%", maxWidth: 512, maxHeight: "75%", borderRadius: nativeRadii.lg, padding: 16, gap: 8 },
  modalChoices: { flexGrow: 0 },
  segment: { flexGrow: 1, flexBasis: 80, gap: 4 },
  image: { width: "100%", height: 200, borderRadius: nativeRadii.md },
  clear: { alignSelf: "flex-start" },
});
