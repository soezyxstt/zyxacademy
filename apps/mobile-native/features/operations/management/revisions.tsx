import { useState } from "react";
import { View } from "react-native";
import { draftConflictKey, mergeManagementDraft, type DraftResolution } from "../../../../../packages/native-parity/operations/management-revisions";
import { Action, Choices, Copy, Heading, Section, styles } from "./ui";

const labels: Record<string, string> = {
  title: "Judul", content: "Konten", summary: "Ringkasan", status: "Status publikasi", category: "Kategori",
  thumbnailUrl: "Thumbnail", tags: "Tag", description: "Deskripsi", slug: "Slug tautan", questions: "Susunan pertanyaan",
  settings: "Pengaturan", acceptingResponses: "Terima respons", displayMode: "Tampilan formulir", collectEmail: "Kumpulkan email",
  openAt: "Jadwal buka", closeAt: "Jadwal tutup", closedMessage: "Pesan saat ditutup", customSuccessMessage: "Pesan konfirmasi",
  allowResponseEditing: "Izinkan edit respons", limitToOneResponse: "Batasi ke satu respons", sendResponseCopy: "Salinan respons",
  maxFileSizeLimit: "Batas ukuran berkas", requireLogin: "Wajib masuk", shuffleQuestions: "Acak pertanyaan", showProgressBar: "Indikator progres",
};

function formatRevisionValue(path: string[], value: unknown): string {
  if (value === undefined || value === null || value === "") return "Kosong";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (path.at(-1) === "status") return value === "published" ? "Terbit" : value === "draft" ? "Draf" : "Terjadwal";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "Kosong";
}

function RevisionValue({ label, value }: { label: string; value: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = value.length > 1200;
  return <View style={styles.field}>
    <Copy strong>{label}</Copy>
    <Copy>{long && !expanded ? `${value.slice(0, 1200)}…` : value}</Copy>
    {long && <View style={styles.row}><Action onPress={() => setExpanded(!expanded)}>{expanded ? "Ringkas nilai" : "Lihat nilai lengkap"}</Action></View>}
  </View>;
}

export function RevisionReview<T extends object>({ baseline, local, saved, onResolve, onClose }: {
  baseline: T; local: T; saved: T; onResolve: (value: T) => void; onClose: () => void;
}) {
  const [resolutions, setResolutions] = useState<Record<string, DraftResolution>>({});
  const { fields, conflicts, ready } = mergeManagementDraft(baseline, local, saved, resolutions);
  return <Section title="Tinjau revisi terbaru">
    <Copy>{conflicts.length ? "Pilih versi untuk setiap bidang yang diubah di kedua revisi." : "Perubahan lokal dapat digabungkan dengan revisi tersimpan."}</Copy>
    {conflicts.map(conflict => {
      const key = draftConflictKey(conflict.path);
      return <Section key={key}>
        <Heading>{conflict.path.map(part => labels[part] ?? part).join(" · ")}</Heading>
        <RevisionValue label="Perubahan lokal" value={formatRevisionValue(conflict.path, conflict.local)} />
        <RevisionValue label="Revisi tersimpan" value={formatRevisionValue(conflict.path, conflict.saved)} />
        <Choices current={resolutions[key] ?? ""} values={[["local", "Pakai lokal"], ["saved", "Pakai tersimpan"]]} onChange={value => {
          if (value) setResolutions(previous => ({ ...previous, [key]: value }));
        }} />
      </Section>;
    })}
    <View style={styles.row}>
      <Action onPress={onClose}>Tutup tinjauan</Action>
      <Action variant="default" disabled={!ready} onPress={() => onResolve(fields)}>Terapkan ke draf</Action>
    </View>
  </Section>;
}
