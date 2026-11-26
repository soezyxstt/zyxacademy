"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { choiceCases, type ChoiceCaseId } from "@/packages/ui-parity/choice-cases";

export function ChoiceCase({ id }: { id: ChoiceCaseId }) {
  const specimen = choiceCases.find((item) => item.id === id);
  if (!specimen) throw new Error(`Unknown choice fixture: ${id}`);
  const Control = specimen.kind === "checkbox" ? Checkbox : Switch;
  const [checked, setChecked] = useState<boolean>(specimen.checked);

  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
      <Control
        aria-label={specimen.label}
        checked={checked}
        data-parity-control={id}
        disabled={specimen.disabled}
        onCheckedChange={(next: boolean | "indeterminate") => setChecked(next === true)}
      />
    </div>
  );
}
