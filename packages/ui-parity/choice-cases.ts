const checkboxSize = { width: 16, height: 16 };
const switchSize = { width: 44, height: 24 };

export const choiceCases = [
  { id: "checkbox-unchecked-light", kind: "checkbox", theme: "light", checked: false, disabled: false, label: "Pilih dokumen", size: checkboxSize },
  { id: "checkbox-checked-light", kind: "checkbox", theme: "light", checked: true, disabled: false, label: "Pilih dokumen", size: checkboxSize },
  { id: "checkbox-disabled-dark", kind: "checkbox", theme: "dark", checked: true, disabled: true, label: "Pilih dokumen", size: checkboxSize },
  { id: "switch-unchecked-light", kind: "switch", theme: "light", checked: false, disabled: false, label: "Menerima tanggapan", size: switchSize },
  { id: "switch-checked-light", kind: "switch", theme: "light", checked: true, disabled: false, label: "Menerima tanggapan", size: switchSize },
  { id: "switch-disabled-dark", kind: "switch", theme: "dark", checked: true, disabled: true, label: "Menerima tanggapan", size: switchSize },
] as const;

export type ChoiceCaseId = (typeof choiceCases)[number]["id"];
