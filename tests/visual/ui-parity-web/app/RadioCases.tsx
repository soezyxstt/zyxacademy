"use client";

import { useState } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { radioCases, radioGroupLabel, radioOptionGap, radioOptions, type RadioCaseId } from "@/packages/ui-parity/radio-cases";

export function RadioCase({ id }: { id: RadioCaseId }) {
  const specimen = radioCases.find((item) => item.id === id);
  if (!specimen) throw new Error(`Unknown radio fixture: ${id}`);
  const [value, setValue] = useState<string>(specimen.value);

  return (
    <RadioGroup
      aria-label={radioGroupLabel}
      data-parity-control={id}
      disabled={specimen.disabled}
      orientation="horizontal"
      onValueChange={setValue}
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: radioOptionGap }}
      value={value}
    >
      {radioOptions.map((option) => (
        <RadioGroupItem
          key={option.value}
          aria-label={option.label}
          data-parity-radio={option.value}
          value={option.value}
        />
      ))}
    </RadioGroup>
  );
}
