import { useContext, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { adminCoursePath } from "../../../../../packages/native-parity/academic/courses/model";
import type { CourseQuizRow } from "../../../../../packages/native-parity/academic/courses/sections";
import { ResponsiveTable, type ResponsiveTableColumn } from "../../shared-ui/data-layout";
import { CourseStatus, CourseTheme, Ink, useCourseColors } from "./ui";

export function CourseTableLink({ title, description, onPress, testID }: {
  title: string; description?: string;
  onPress(): void;
  testID?: string;
}) {
  const color = useCourseColors();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessibilityRole="link" onPress={onPress} testID={testID}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        tableLink,
        pressed && { backgroundColor: color.muted },
        focused && { outlineColor: color.accent, outlineOffset: 2, outlineWidth: 2 },
      ]}>
      <Ink kind="strong">{title}</Ink>
      {description ? <Ink kind="meta" tone="muted">{description}</Ink> : null}
    </Pressable>
  );
}

const tableLink = StyleSheet.create({ root: { minHeight: 44, justifyContent: "center", gap: 3, borderRadius: nativeRadii.sm } }).root;

const quizStatus: Record<string, string> = {
  published: "Terbit",
  draft: "Draf",
};

export function QuizResultsTable({ rows, slug, navigate }: {
  rows: readonly CourseQuizRow[];
  slug: string;
  navigate(path: string): void;
}) {
  const theme = useContext(CourseTheme);
  const columns: readonly ResponsiveTableColumn<CourseQuizRow>[] = [
    {
      id: "quiz", label: "Kuis", weight: 3,
      renderCell: (row) => <CourseTableLink title={row.title}
        description={[row.category, quizStatus[row.status] ?? row.status, row.hasInsight ? "Analisis tersedia" : null].filter(Boolean).join(" · ")}
        testID={`course-analytics-quiz-${row.id}`} onPress={() => navigate(adminCoursePath(slug, "analytics", row.id))} />,
    },
    { id: "attempts", label: "Pengerjaan selesai", align: "end", renderCell: (row) => row.totalAttempts },
    { id: "score", label: "Rata-rata skor", align: "end", renderCell: (row) => row.totalAttempts ? row.avgScore : "-" },
    { id: "pass", label: "Kelulusan", align: "end", renderCell: (row) => row.totalAttempts ? `${row.passRate}%` : "-" },
  ];
  return <ResponsiveTable theme={theme} columns={columns} rows={rows} getRowKey={(row) => row.id} testID="course-analytics-results"
    empty={<CourseStatus label="Tidak ada kuis pada pilihan ini." />} />;
}

export type AttemptRow = {
  id: string;
  name: string;
  status: string;
  dateLabel: string;
  score: number | null;
  duration: number | null;
};

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} mnt ${seconds % 60} dtk` : `${seconds} dtk`;
}

const attemptColumns: readonly ResponsiveTableColumn<AttemptRow>[] = [
  { id: "name", label: "Peserta", weight: 2, renderCell: (row) => row.name },
  { id: "date", label: "Tanggal", renderCell: (row) => row.dateLabel },
  { id: "status", label: "Status", renderCell: (row) => row.status },
  { id: "duration", label: "Durasi", align: "end", renderCell: (row) => row.duration === null ? "-" : formatDuration(row.duration) },
  { id: "score", label: "Skor", align: "end", renderCell: (row) => row.score ?? "-" },
];

export function QuizAttemptsTable({ rows }: { rows: readonly AttemptRow[] }) {
  const theme = useContext(CourseTheme);
  return <ResponsiveTable theme={theme} columns={attemptColumns} rows={rows} getRowKey={(row) => row.id}
    testID="course-analytics-attempts" empty={<CourseStatus label="Tidak ada pengerjaan pada pilihan ini." />} />;
}
