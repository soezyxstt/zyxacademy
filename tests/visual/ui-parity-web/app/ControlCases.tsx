"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  controlPosition,
  getControlCase,
  type ButtonFixture,
  type ControlCaseId,
  type FieldFixture,
} from "@/packages/ui-parity/control-cases";

function ButtonCase({ id, fixture }: { id: ControlCaseId; fixture: ButtonFixture }) {
  const [activated, setActivated] = useState(false);

  return (
    <div style={{ ...controlPosition, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Button
        data-parity-control={id}
        type="button"
        disabled={fixture.disabled}
        size={fixture.icon ? "icon" : "default"}
        variant={fixture.icon ? "outline" : "default"}
        aria-label={fixture.icon ? fixture.label : undefined}
        onClick={() => setActivated(true)}
      >
        {fixture.icon ? <Plus aria-hidden="true" /> : fixture.label}
      </Button>
      <span role="status" className="text-body-xs" style={{ position: "absolute", top: 74 }}>
        {activated ? fixture.response : null}
      </span>
    </div>
  );
}

function FieldCase({ id, fixture }: { id: ControlCaseId; fixture: FieldFixture }) {
  const inputId = `${id}-input`;
  const Field = fixture.component === "textarea" ? Textarea : Input;
  const showLabel = fixture.component === "label";

  return (
    <div style={{ ...controlPosition, display: "flex", flexDirection: "column-reverse", justifyContent: "center", gap: 8 }}>
      <Field
        id={inputId}
        className={showLabel ? "peer" : undefined}
        data-parity-control={showLabel ? undefined : id}
        aria-label={showLabel ? undefined : fixture.label}
        disabled={fixture.disabled}
        placeholder={fixture.placeholder}
        defaultValue={fixture.value}
      />
      {showLabel && <Label data-parity-control={id} htmlFor={inputId}>{fixture.label}</Label>}
    </div>
  );
}

export function ControlCase({ id }: { id: ControlCaseId }) {
  const fixture = getControlCase(id);
  return fixture.component === "button" ? <ButtonCase id={id} fixture={fixture} /> : <FieldCase id={id} fixture={fixture} />;
}
