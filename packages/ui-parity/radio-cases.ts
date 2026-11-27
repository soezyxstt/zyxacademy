export const radioOptions = [
  { value: "standard", label: "Standar" },
  { value: "exam", label: "Ketik jawaban" },
] as const;

export const radioGroupLabel = "Mode flashcard";
export const radioOptionGap = 32;

export const radioCases = [
  { id: "radio-group-unchecked-light", component: "radio-group", theme: "light", value: "", disabled: false },
  { id: "radio-group-checked-light", component: "radio-group", theme: "light", value: "standard", disabled: false },
  { id: "radio-group-disabled-dark", component: "radio-group", theme: "dark", value: "standard", disabled: true },
] as const;

export type RadioCaseId = (typeof radioCases)[number]["id"];
