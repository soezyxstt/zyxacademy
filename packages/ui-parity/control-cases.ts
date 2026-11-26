import { parityFrame } from "./frame";

type Theme = "light" | "dark";

export type ButtonFixture = {
  component: "button";
  theme: Theme;
  label: string;
  response: string;
  disabled?: boolean;
  icon?: "plus";
};

export type FieldFixture = {
  component: "label" | "input" | "textarea";
  theme: Theme;
  label: string;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
};

export const controlCases = [
  { id: "button-default-light", component: "button", theme: "light", label: "Simpan", response: "Tersimpan" },
  { id: "button-disabled-dark", component: "button", theme: "dark", label: "Simpan", response: "Tersimpan", disabled: true },
  { id: "button-icon-light", component: "button", theme: "light", label: "Tambah", response: "Ditambahkan", icon: "plus" },
  { id: "label-empty-light", component: "label", theme: "light", label: "Nama preset" },
  { id: "label-long-dark", component: "label", theme: "dark", label: "Nama template evaluasi praktikum", value: "Penilaian praktikum" },
  { id: "label-disabled-light", component: "label", theme: "light", label: "Nama preset", value: "Preset bawaan", disabled: true },
  { id: "input-empty-light", component: "input", theme: "light", label: "Nama preset", placeholder: "Masukkan nama preset" },
  { id: "input-long-dark", component: "input", theme: "dark", label: "Nama preset", value: "Penilaian praktikum gelombang" },
  { id: "input-disabled-light", component: "input", theme: "light", label: "Nama preset", value: "Preset bawaan", disabled: true },
  { id: "textarea-empty-light", component: "textarea", theme: "light", label: "Catatan sesi", placeholder: "Tulis catatan sesi" },
  { id: "textarea-multiline-dark", component: "textarea", theme: "dark", label: "Ringkasan sesi", value: "Fungsi kuadrat\nDiskusikan titik puncak dan akar." },
  { id: "textarea-disabled-light", component: "textarea", theme: "light", label: "Catatan sesi", value: "Sesi telah selesai.", disabled: true },
] as const satisfies readonly ((ButtonFixture | FieldFixture) & { id: string })[];

export type ControlCaseId = (typeof controlCases)[number]["id"];

export function getControlCase(id: ControlCaseId): ButtonFixture | FieldFixture {
  const fixture = controlCases.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown control fixture ${id}`);
  return fixture;
}

const fieldWidth = 256;

export const controlPosition = {
  position: "absolute",
  left: (parityFrame.width - fieldWidth) / 2,
  top: 0,
  width: fieldWidth,
  height: parityFrame.height,
} as const;
