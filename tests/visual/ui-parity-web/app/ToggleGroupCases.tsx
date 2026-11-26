"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  toggleGroupLabel, toggleGroupPosition, toggleSelectionLabel, toggleSubjects, type ToggleGroupCaseSpec,
} from "@/packages/ui-parity/toggle-group-cases";

export function ToggleGroupCase({ item }: { item: ToggleGroupCaseSpec }) {
  const [selection, setSelection] = useState<string[] | null>(null);
  const controls = toggleSubjects.map(({ value, label }) => (
    <ToggleGroupItem key={value} value={value} disabled={item.disabledItem === value}>{label}</ToggleGroupItem>
  ));
  const common = { "aria-label": toggleGroupLabel, disabled: item.disabled, style: { minHeight: 44 } };
  return (
    <div style={toggleGroupPosition}>
      {item.type === "single" ? (
        <ToggleGroup {...common} type="single" defaultValue={item.initial}
          onValueChange={value => setSelection(value ? [value] : [])}>
          {controls}
        </ToggleGroup>
      ) : (
        <ToggleGroup {...common} type="multiple" value={selection ?? [...item.initial]} onValueChange={setSelection}>
          {controls}
        </ToggleGroup>
      )}
      {selection && <output className="mt-1 block text-body-xs">{toggleSelectionLabel(selection)}</output>}
    </div>
  );
}
