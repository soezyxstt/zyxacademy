export type ToggleGroupType = "single" | "multiple";

export function toggleGroupSelection(type: ToggleGroupType, selection: readonly string[], value: string): readonly string[] {
  if (type === "single") {
    if (value === "") return selection;
    return selection[0] === value ? [] : [value];
  }
  return selection.includes(value) ? selection.filter(item => item !== value) : [...selection, value];
}
