"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { sliderPosition, type SliderCaseSpec } from "@/packages/ui-parity/slider-cases";

export function SliderCase({ item }: { item: SliderCaseSpec }) {
  const [value, setValue] = useState<number>(item.value);
  const [committed, setCommitted] = useState<number | null>(null);
  return (
    <div style={sliderPosition}>
      <Slider data-parity-slider aria-label={item.label} value={[value]} min={item.min} max={item.max}
        step={item.step} disabled={item.disabled} dir={item.dir} style={{ height: sliderPosition.height }}
        onValueChange={([next]) => setValue(next)} onValueCommit={([next]) => setCommitted(next)} />
      {committed !== null && <output data-parity-slider-commit className="mt-1 block text-center text-body-xs">Nilai {committed}</output>}
    </div>
  );
}
