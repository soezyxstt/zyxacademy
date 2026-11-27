import { StyleSheet, Text } from "react-native";
import { Input } from "../../../components/Input";
import { useLearningColors } from "./ui";

export function PythonCodeField({ label, code, editable, onChange }: {
  label: string; code: string; editable: boolean; onChange(code: string): void;
}) {
  return <Input accessibilityLabel={label} multiline autoCapitalize="none" autoCorrect={false} spellCheck={false}
    style={styles.editor} textAlignVertical="top" value={code} maxLength={64_000}
    editable={editable} onChangeText={onChange} />;
}

export function PythonOutput({ content }: { content: string }) {
  const colors = useLearningColors();
  return <Text selectable style={[styles.output, { color: colors.foreground }]}>{content}</Text>;
}

const styles = StyleSheet.create({
  editor: { minHeight: 176, fontFamily: "monospace" },
  output: { fontFamily: "monospace", fontSize: 14 },
});
