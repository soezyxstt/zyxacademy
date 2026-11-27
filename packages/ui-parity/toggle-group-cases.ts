import { parityFrame } from "./frame";

export const toggleSubjects = [
  { value: "calc", label: "Kalkulus" },
  { value: "phys", label: "Fisika" },
  { value: "chem", label: "Kimia" },
] as const;

type ToggleGroupCase = {
  id: string;
  theme: "light" | "dark";
  disabled?: boolean;
  disabledItem?: string;
} & ({ type: "single"; initial: string } | { type: "multiple"; initial: readonly string[] });

export const toggleGroupCases = [
  { id: "toggle-group-single-light", theme: "light", type: "single", initial: "calc" },
  { id: "toggle-group-multiple-dark", theme: "dark", type: "multiple", initial: ["calc", "chem"], disabledItem: "chem" },
  { id: "toggle-group-disabled-light", theme: "light", type: "single", initial: "phys", disabled: true },
] as const satisfies readonly ToggleGroupCase[];

export type ToggleGroupCaseSpec = ToggleGroupCase;

export const toggleGroupLabel = "Pilihan mata kuliah";
export const toggleGroupPosition = { position: "absolute", left: 16, top: 20, width: parityFrame.width - 32 } as const;

export function toggleSelectionLabel(selection: readonly string[]) {
  return toggleSubjects.filter(subject => selection.includes(subject.value)).map(subject => subject.label).join(", ") || "Belum dipilih";
}
